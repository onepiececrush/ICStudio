export function createNpmRunCommand(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm run dev"],
    };
  }

  return {
    command: "npm",
    args: ["run", "dev"],
  };
}
