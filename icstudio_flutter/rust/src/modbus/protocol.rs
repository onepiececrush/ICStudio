use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;

static NEXT_TRANSACTION_ID: AtomicU16 = AtomicU16::new(1);

pub(crate) fn connect_modbus_tcp(
    host: &str,
    port: u16,
    connect_timeout_ms: u64,
    request_timeout_ms: u64,
) -> Result<TcpStream, String> {
    let address_text = format!("{host}:{port}");
    let address = address_text
        .to_socket_addrs()
        .map_err(|error| format!("解析地址 {address_text} 失败: {error}"))?
        .next()
        .ok_or_else(|| format!("解析地址 {address_text} 失败: 无可用地址"))?;
    let stream = TcpStream::connect_timeout(&address, Duration::from_millis(connect_timeout_ms))
        .map_err(|error| format!("连接 {address_text} 失败: {error}"))?;
    let timeout = Some(Duration::from_millis(request_timeout_ms));
    stream
        .set_read_timeout(timeout)
        .map_err(|error| format!("设置读超时失败: {error}"))?;
    stream
        .set_write_timeout(timeout)
        .map_err(|error| format!("设置写超时失败: {error}"))?;
    stream.set_nodelay(true).ok();
    Ok(stream)
}

pub(crate) fn read_registers_with_stream(
    stream: &mut TcpStream,
    unit_id: u8,
    function_code: u8,
    address: u16,
    quantity: u16,
) -> Result<Vec<u16>, String> {
    if !matches!(function_code, 3 | 4) {
        return Err("读寄存器仅支持 FC03/FC04".to_string());
    }
    if quantity == 0 || quantity > 125 {
        return Err("quantity 必须在 1..125".to_string());
    }
    let mut payload = Vec::with_capacity(4);
    payload.extend_from_slice(&address.to_be_bytes());
    payload.extend_from_slice(&quantity.to_be_bytes());
    let pdu = modbus_tcp_roundtrip(stream, unit_id, function_code, &payload)?;
    if pdu.len() < 2 {
        return Err("响应 PDU 长度不足".to_string());
    }
    let byte_count = pdu[1] as usize;
    if byte_count != quantity as usize * 2 || pdu.len() < 2 + byte_count {
        return Err(format!(
            "响应长度不匹配 byteCount={byte_count}, quantity={quantity}"
        ));
    }
    Ok((0..quantity as usize)
        .map(|index| {
            let offset = 2 + index * 2;
            u16::from_be_bytes([pdu[offset], pdu[offset + 1]])
        })
        .collect())
}

pub(crate) fn write_single_register_with_stream(
    stream: &mut TcpStream,
    unit_id: u8,
    address: u16,
    value: u16,
) -> Result<(), String> {
    let mut payload = Vec::with_capacity(4);
    payload.extend_from_slice(&address.to_be_bytes());
    payload.extend_from_slice(&value.to_be_bytes());
    let pdu = modbus_tcp_roundtrip(stream, unit_id, 6, &payload)?;
    if pdu.get(1..5) != Some(payload.as_slice()) {
        return Err("FC06 响应与请求不一致".to_string());
    }
    Ok(())
}

fn modbus_tcp_roundtrip(
    stream: &mut TcpStream,
    unit_id: u8,
    function_code: u8,
    payload: &[u8],
) -> Result<Vec<u8>, String> {
    let transaction_id = NEXT_TRANSACTION_ID.fetch_add(1, Ordering::Relaxed);
    let pdu_len = 1 + payload.len();
    let mut request = Vec::with_capacity(7 + pdu_len);
    request.extend_from_slice(&transaction_id.to_be_bytes());
    request.extend_from_slice(&0u16.to_be_bytes());
    request.extend_from_slice(&((pdu_len + 1) as u16).to_be_bytes());
    request.push(unit_id);
    request.push(function_code);
    request.extend_from_slice(payload);
    stream
        .write_all(&request)
        .map_err(|error| format!("发送 Modbus TCP 请求失败: {error}"))?;

    let mut header = [0u8; 7];
    stream
        .read_exact(&mut header)
        .map_err(|error| format!("读取 MBAP 失败: {error}"))?;
    let response_tid = u16::from_be_bytes([header[0], header[1]]);
    let protocol_id = u16::from_be_bytes([header[2], header[3]]);
    let length = u16::from_be_bytes([header[4], header[5]]) as usize;
    let response_unit = header[6];
    if response_tid != transaction_id {
        return Err(format!(
            "TID 不匹配: 请求 {transaction_id}, 响应 {response_tid}"
        ));
    }
    if protocol_id != 0 {
        return Err(format!("非法 protocolId={protocol_id}"));
    }
    if response_unit != unit_id {
        return Err(format!(
            "Unit ID 不匹配: 请求 {unit_id}, 响应 {response_unit}"
        ));
    }
    if length == 0 || length > 260 {
        return Err(format!("非法 MBAP length={length}"));
    }
    let mut pdu = vec![0u8; length - 1];
    stream
        .read_exact(&mut pdu)
        .map_err(|error| format!("读取 PDU 失败: {error}"))?;
    if pdu.first().copied() == Some(function_code | 0x80) {
        return Err(format!(
            "Modbus 异常码 {}",
            pdu.get(1).copied().unwrap_or_default()
        ));
    }
    if pdu.first().copied() != Some(function_code) {
        return Err(format!(
            "功能码不匹配: 请求 FC{function_code:02}, 响应 {:?}",
            pdu.first()
        ));
    }
    Ok(pdu)
}
