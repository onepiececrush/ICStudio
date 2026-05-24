use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};
use std::ptr;

/// SQLite 轻量 FFI 包装：把所有 unsafe 调用限制在本模块内。
/// 调用方只能拿到 Result 风格的连接和语句 API，不能直接触碰裸指针。
#[allow(non_camel_case_types)]
enum sqlite3 {}

#[allow(non_camel_case_types)]
enum sqlite3_stmt {}

#[link(name = "sqlite3")]
unsafe extern "C" {
    fn sqlite3_open(filename: *const c_char, pp_db: *mut *mut sqlite3) -> c_int;
    fn sqlite3_close(db: *mut sqlite3) -> c_int;
    fn sqlite3_errmsg(db: *mut sqlite3) -> *const c_char;
    fn sqlite3_exec(
        db: *mut sqlite3,
        sql: *const c_char,
        callback: Option<
            unsafe extern "C" fn(*mut c_void, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int,
        >,
        arg: *mut c_void,
        errmsg: *mut *mut c_char,
    ) -> c_int;
    fn sqlite3_prepare_v2(
        db: *mut sqlite3,
        sql: *const c_char,
        n_byte: c_int,
        stmt: *mut *mut sqlite3_stmt,
        tail: *mut *const c_char,
    ) -> c_int;
    fn sqlite3_finalize(stmt: *mut sqlite3_stmt) -> c_int;
    fn sqlite3_reset(stmt: *mut sqlite3_stmt) -> c_int;
    fn sqlite3_clear_bindings(stmt: *mut sqlite3_stmt) -> c_int;
    fn sqlite3_step(stmt: *mut sqlite3_stmt) -> c_int;
    fn sqlite3_bind_int64(stmt: *mut sqlite3_stmt, index: c_int, value: i64) -> c_int;
    fn sqlite3_bind_double(stmt: *mut sqlite3_stmt, index: c_int, value: f64) -> c_int;
    fn sqlite3_bind_text(
        stmt: *mut sqlite3_stmt,
        index: c_int,
        value: *const c_char,
        n: c_int,
        destructor: Option<unsafe extern "C" fn(*mut c_void)>,
    ) -> c_int;
    fn sqlite3_bind_null(stmt: *mut sqlite3_stmt, index: c_int) -> c_int;
    fn sqlite3_column_int64(stmt: *mut sqlite3_stmt, column: c_int) -> i64;
    fn sqlite3_column_double(stmt: *mut sqlite3_stmt, column: c_int) -> f64;
    fn sqlite3_column_text(stmt: *mut sqlite3_stmt, column: c_int) -> *const u8;
}

const SQLITE_OK: c_int = 0;
const SQLITE_ROW: c_int = 100;
const SQLITE_DONE: c_int = 101;

pub(super) struct SqliteConnection {
    db: *mut sqlite3,
}

impl SqliteConnection {
    pub(super) fn open(path: &str) -> Result<Self, String> {
        let c_path = CString::new(path).map_err(|_| "SQLite 路径包含非法空字符".to_string())?;
        let mut db = ptr::null_mut();
        let rc = unsafe { sqlite3_open(c_path.as_ptr(), &mut db) };
        if rc != SQLITE_OK {
            let error = if db.is_null() {
                "无法打开 SQLite 数据库".to_string()
            } else {
                sqlite_error(db)
            };
            if !db.is_null() {
                unsafe { sqlite3_close(db) };
            }
            return Err(error);
        }
        Ok(Self { db })
    }

    pub(super) fn exec(&self, sql: &str) -> Result<(), String> {
        let c_sql = CString::new(sql).map_err(|_| "SQL 包含非法空字符".to_string())?;
        let rc = unsafe {
            sqlite3_exec(
                self.db,
                c_sql.as_ptr(),
                None,
                ptr::null_mut(),
                ptr::null_mut(),
            )
        };
        if rc == SQLITE_OK {
            Ok(())
        } else {
            Err(sqlite_error(self.db))
        }
    }

    pub(super) fn prepare(&self, sql: &str) -> Result<SqliteStatement, String> {
        let c_sql = CString::new(sql).map_err(|_| "SQL 包含非法空字符".to_string())?;
        let mut stmt = ptr::null_mut();
        let rc =
            unsafe { sqlite3_prepare_v2(self.db, c_sql.as_ptr(), -1, &mut stmt, ptr::null_mut()) };
        if rc == SQLITE_OK {
            Ok(SqliteStatement {
                db: self.db,
                stmt,
                text_params: Vec::new(),
            })
        } else {
            Err(sqlite_error(self.db))
        }
    }
}

impl Drop for SqliteConnection {
    fn drop(&mut self) {
        if !self.db.is_null() {
            unsafe { sqlite3_close(self.db) };
        }
    }
}

pub(super) struct SqliteStatement {
    db: *mut sqlite3,
    stmt: *mut sqlite3_stmt,
    text_params: Vec<CString>,
}

impl SqliteStatement {
    pub(super) fn bind_i64(&mut self, index: i32, value: i64) -> Result<(), String> {
        self.check(unsafe { sqlite3_bind_int64(self.stmt, index, value) })
    }

    pub(super) fn bind_f64(&mut self, index: i32, value: f64) -> Result<(), String> {
        self.check(unsafe { sqlite3_bind_double(self.stmt, index, value) })
    }

    pub(super) fn bind_text(&mut self, index: i32, value: &str) -> Result<(), String> {
        let text = CString::new(value).map_err(|_| "SQLite 文本包含非法空字符".to_string())?;
        self.text_params.push(text);
        let ptr = self
            .text_params
            .last()
            .expect("text param just pushed")
            .as_ptr();
        self.check(unsafe { sqlite3_bind_text(self.stmt, index, ptr, -1, None) })
    }

    pub(super) fn bind_null(&mut self, index: i32) -> Result<(), String> {
        self.check(unsafe { sqlite3_bind_null(self.stmt, index) })
    }

    pub(super) fn reset(&mut self) -> Result<(), String> {
        self.check(unsafe { sqlite3_reset(self.stmt) })?;
        self.check(unsafe { sqlite3_clear_bindings(self.stmt) })?;
        self.text_params.clear();
        Ok(())
    }

    pub(super) fn step_done(&mut self) -> Result<(), String> {
        match unsafe { sqlite3_step(self.stmt) } {
            SQLITE_DONE => Ok(()),
            _ => Err(sqlite_error(self.db)),
        }
    }

    pub(super) fn step_row(&mut self) -> Result<bool, String> {
        match unsafe { sqlite3_step(self.stmt) } {
            SQLITE_ROW => Ok(true),
            SQLITE_DONE => Ok(false),
            _ => Err(sqlite_error(self.db)),
        }
    }

    pub(super) fn column_i64(&self, column: i32) -> i64 {
        unsafe { sqlite3_column_int64(self.stmt, column) }
    }

    pub(super) fn column_f64(&self, column: i32) -> f64 {
        unsafe { sqlite3_column_double(self.stmt, column) }
    }

    pub(super) fn column_text(&self, column: i32) -> String {
        let ptr = unsafe { sqlite3_column_text(self.stmt, column) };
        if ptr.is_null() {
            String::new()
        } else {
            unsafe { CStr::from_ptr(ptr as *const c_char) }
                .to_string_lossy()
                .to_string()
        }
    }

    fn check(&self, rc: c_int) -> Result<(), String> {
        if rc == SQLITE_OK {
            Ok(())
        } else {
            Err(sqlite_error(self.db))
        }
    }
}

impl Drop for SqliteStatement {
    fn drop(&mut self) {
        if !self.stmt.is_null() {
            unsafe { sqlite3_finalize(self.stmt) };
        }
    }
}

fn sqlite_error(db: *mut sqlite3) -> String {
    if db.is_null() {
        return "SQLite 数据库未打开".to_string();
    }
    let message = unsafe { sqlite3_errmsg(db) };
    if message.is_null() {
        "SQLite 操作失败".to_string()
    } else {
        unsafe { CStr::from_ptr(message) }
            .to_string_lossy()
            .to_string()
    }
}
