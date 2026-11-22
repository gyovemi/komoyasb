//! Subprocess management and execution helpers for PowerShell and external binaries.
//!
//! Handles invocation of Windows PowerShell scripts and standard executables
//! with non-interactive flags, execution policy bypass, and dry-run sandbox interception.

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use crate::error::AppError;

/// Default timeout duration for PowerShell script executions (30 seconds).
pub const DEFAULT_SCRIPT_TIMEOUT: Duration = Duration::from_secs(30);

/// Captured execution result from a launched child process.
pub struct ProcessOutput {
    /// Whether the process exited with an exit code of 0.
    pub success: bool,
    /// Standard output stream decoded as a UTF-8 string.
    pub stdout: String,
    /// Standard error stream decoded as a UTF-8 string.
    pub stderr: String,
    /// Process termination status code if available.
    pub exit_code: Option<i32>,
}

/// Executes a PowerShell script file using `powershell.exe` with default 30-second timeout.
///
/// Under sandbox simulation mode (`is_sandboxed == true`), skips actual process invocation
/// to avoid mutating the host system or requiring elevated permissions.
///
/// # Arguments
///
/// * `script_path` - Filesystem path to the target `.ps1` script.
/// * `args` - Array of argument slices passed to the script.
/// * `is_sandboxed` - Flag indicating whether execution should be simulated.
///
/// # Returns
///
/// * `Ok(ProcessOutput)` - Process execution record including stdout, stderr, and exit code.
/// * `Err(AppError)` - If subprocess spawning fails or execution times out.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if `powershell.exe` fails to launch or times out.
pub fn run_powershell_script(
    script_path: &str,
    args: &[&str],
    is_sandboxed: bool,
) -> Result<ProcessOutput, AppError> {
    run_powershell_script_timeout(script_path, args, is_sandboxed, DEFAULT_SCRIPT_TIMEOUT)
}

/// Executes a PowerShell script file using `powershell.exe` with an explicit timeout.
///
/// Under sandbox simulation mode (`is_sandboxed == true`), skips actual process invocation.
///
/// # Arguments
///
/// * `script_path` - Filesystem path to the target `.ps1` script.
/// * `args` - Array of argument slices passed to the script.
/// * `is_sandboxed` - Flag indicating whether execution should be simulated.
/// * `timeout` - Maximum allowable execution duration before terminating child process.
///
/// # Returns
///
/// * `Ok(ProcessOutput)` - Process execution record.
/// * `Err(AppError)` - If subprocess fails to launch or exceeds timeout duration.
pub fn run_powershell_script_timeout(
    script_path: &str,
    args: &[&str],
    is_sandboxed: bool,
    timeout: Duration,
) -> Result<ProcessOutput, AppError> {
    if is_sandboxed {
        // Return simulated success in sandbox mode to prevent host side-effects
        return Ok(ProcessOutput {
            success: true,
            stdout: format!("[SANDBOX SIMULATION] Executed powershell script {} {:?}", script_path, args),
            stderr: String::new(),
            exit_code: Some(0),
        });
    }

    let mut command_runner = Command::new("powershell.exe");
    command_runner.args(&[
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script_path,
    ]);
    command_runner.args(args);
    command_runner.stdout(Stdio::piped());
    command_runner.stderr(Stdio::piped());

    let mut child_process = command_runner.spawn().map_err(|spawn_err| {
        AppError::process(format!("Failed to spawn powershell process: {}", spawn_err))
    })?;

    // Drain stdout and stderr asynchronously in dedicated reader threads to prevent pipe buffer deadlock
    let mut stdout_pipe = child_process.stdout.take();
    let mut stderr_pipe = child_process.stderr.take();

    let stdout_reader_thread = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        if let Some(mut stream) = stdout_pipe.take() {
            let _ = stream.read_to_end(&mut buffer);
        }
        buffer
    });

    let stderr_reader_thread = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        if let Some(mut stream) = stderr_pipe.take() {
            let _ = stream.read_to_end(&mut buffer);
        }
        buffer
    });

    let start_time = Instant::now();
    let poll_interval = Duration::from_millis(50);

    let exit_status = loop {
        match child_process.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if start_time.elapsed() >= timeout {
                    let _ = child_process.kill();
                    let _ = child_process.wait();
                    return Err(AppError::process(format!(
                        "PowerShell script execution timed out after {:.1}s: {}",
                        timeout.as_secs_f32(),
                        script_path
                    )));
                }
                std::thread::sleep(poll_interval);
            }
            Err(poll_err) => {
                let _ = child_process.kill();
                let _ = child_process.wait();
                return Err(AppError::process(format!(
                    "Error monitoring powershell process: {}",
                    poll_err
                )));
            }
        }
    };

    let stdout_bytes = stdout_reader_thread.join().unwrap_or_default();
    let stderr_bytes = stderr_reader_thread.join().unwrap_or_default();

    Ok(ProcessOutput {
        success: exit_status.success(),
        stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
        stderr: String::from_utf8_lossy(&stderr_bytes).to_string(),
        exit_code: exit_status.code(),
    })
}

/// Executes an arbitrary binary program with argument slices.
///
/// Under sandbox simulation mode (`is_sandboxed == true`), skips actual process invocation.
///
/// # Arguments
///
/// * `program` - Binary executable name or path.
/// * `args` - Array of argument slices.
/// * `is_sandboxed` - Flag indicating whether execution should be simulated.
///
/// # Returns
///
/// * `Ok(ProcessOutput)` - Process execution record.
/// * `Err(AppError)` - If process spawning fails.
///
/// # Errors
///
/// Returns [`AppError::ProcessError`] if binary execution fails.
pub fn run_command_binary(
    program: &str,
    args: &[&str],
    is_sandboxed: bool,
) -> Result<ProcessOutput, AppError> {
    if is_sandboxed {
        return Ok(ProcessOutput {
            success: true,
            stdout: format!("[SANDBOX SIMULATION] Executed {} {:?}", program, args),
            stderr: String::new(),
            exit_code: Some(0),
        });
    }

    let mut command_runner = Command::new(program);
    command_runner.args(args);

    let output_result = command_runner.output().map_err(|exec_err| {
        AppError::process(format!("Failed to execute command '{}': {}", program, exec_err))
    })?;

    Ok(ProcessOutput {
        success: output_result.status.success(),
        stdout: String::from_utf8_lossy(&output_result.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output_result.stderr).to_string(),
        exit_code: output_result.status.code(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_powershell_script_sandbox_mode() {
        let script = "C:\\path\\to\\script.ps1";
        let args = ["-Action", "Status", "-DryRun"];
        let result = run_powershell_script(script, &args, true);

        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.success);
        assert_eq!(output.exit_code, Some(0));
        assert!(output.stdout.contains("[SANDBOX SIMULATION]"));
        assert!(output.stdout.contains("script.ps1"));
        assert!(output.stderr.is_empty());
    }

    #[test]
    fn test_run_command_binary_sandbox_mode() {
        let program = "komorebic.exe";
        let args = ["stop", "--whkd"];
        let result = run_command_binary(program, &args, true);

        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.success);
        assert_eq!(output.exit_code, Some(0));
        assert!(output.stdout.contains("[SANDBOX SIMULATION]"));
        assert!(output.stdout.contains("komorebic.exe"));
        assert!(output.stderr.is_empty());
    }

    #[test]
    fn test_run_command_binary_invalid_program() {
        let program = "completely_invalid_executable_binary_12345";
        let args = ["--version"];
        let result = run_command_binary(program, &args, false);

        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::ProcessError { message, .. } => {
                assert!(message.contains("completely_invalid_executable_binary_12345"));
            }
            other => panic!("Expected ProcessError, got {:?}", other),
        }
    }

    #[test]
    fn test_run_command_binary_valid_execution() {
        #[cfg(windows)]
        let (prog, args) = ("whoami.exe", &[][..]);
        #[cfg(not(windows))]
        let (prog, args) = ("whoami", &[][..]);

        let result = run_command_binary(prog, args, false);
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.success);
    }

    #[test]
    fn test_run_powershell_script_timeout_triggers() {
        let temp_dir = tempfile::tempdir().unwrap();
        let slow_script = temp_dir.path().join("slow.ps1");
        std::fs::write(&slow_script, "Start-Sleep -Seconds 10\nexit 0").unwrap();

        let result = run_powershell_script_timeout(
            &slow_script.to_string_lossy(),
            &[],
            false,
            Duration::from_millis(300),
        );

        assert!(result.is_err(), "Script should have timed out");
        match result.unwrap_err() {
            AppError::ProcessError { message, .. } => {
                assert!(message.contains("timed out"), "Error message should mention timeout: {}", message);
            }
            other => panic!("Expected ProcessError with timeout, got {:?}", other),
        }
    }
}
