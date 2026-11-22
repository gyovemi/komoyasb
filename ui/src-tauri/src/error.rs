//! Centralized application error handling and serialization models.
//!
//! Maps internal domain errors (validation failures, I/O errors, process execution faults)
//! into standardized serialized responses consumed by the frontend IPC bridge.

use serde::{Deserialize, Serialize};

/// Enumeration of application errors originating across backend services.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// Configuration schema or structural validation failed.
    #[error("Validation failed: {message}")]
    ValidationFailed {
        /// Human-readable description of the validation failure.
        message: String,
        /// Optional structured diagnostic details.
        details: Option<serde_json::Value>,
    },
    /// Low-level filesystem input/output operation failed.
    #[error("IO error: {message}")]
    IoError {
        /// Human-readable error description.
        message: String,
        /// Optional structured diagnostic details.
        details: Option<serde_json::Value>,
    },
    /// Subprocess spawn, execution, or termination failure.
    #[error("Process error: {message}")]
    ProcessError {
        /// Error message reported during process execution.
        message: String,
        /// Optional structured diagnostic details.
        details: Option<serde_json::Value>,
    },
    /// Security boundary violation or unauthorized path traversal detected.
    #[error("Sandbox violation: {message}")]
    SandboxViolation {
        /// Violation description identifying the restricted operation.
        message: String,
        /// Optional structured diagnostic details.
        details: Option<serde_json::Value>,
    },
    /// Configuration parsing failure (JSON or YAML syntax error).
    #[error("Parse error: {message}")]
    ParseError {
        /// Description of the parsing syntax error.
        message: String,
        /// Optional structured diagnostic details.
        details: Option<serde_json::Value>,
    },
}

/// Serialized payload returned across the Tauri IPC bridge upon command failure.
#[derive(Serialize, Deserialize)]
pub struct AppErrorResponse {
    /// Machine-readable standardized error code.
    pub code: String,
    /// Human-readable English error message.
    pub message: String,
    /// Optional context-specific JSON details.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl AppError {
    /// Constructs a `ValidationFailed` error with message and optional details.
    pub fn validation<M: Into<String>>(message: M) -> Self {
        AppError::ValidationFailed {
            message: message.into(),
            details: None,
        }
    }

    /// Constructs an `IoError` with formatted message and optional details.
    pub fn io<M: Into<String>>(message: M) -> Self {
        AppError::IoError {
            message: message.into(),
            details: None,
        }
    }

    /// Constructs a `ProcessError` with formatted message and optional details.
    pub fn process<M: Into<String>>(message: M) -> Self {
        AppError::ProcessError {
            message: message.into(),
            details: None,
        }
    }

    /// Constructs a `SandboxViolation` with formatted message and optional details.
    pub fn sandbox<M: Into<String>>(message: M) -> Self {
        AppError::SandboxViolation {
            message: message.into(),
            details: None,
        }
    }

    /// Constructs a `ParseError` with formatted message and optional details.
    pub fn parse<M: Into<String>>(message: M) -> Self {
        AppError::ParseError {
            message: message.into(),
            details: None,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let response_payload = match self {
            AppError::ValidationFailed { message, details } => AppErrorResponse {
                code: "VALIDATION_FAILED".to_string(),
                message: message.clone(),
                details: details.clone(),
            },
            AppError::IoError { message, details } => AppErrorResponse {
                code: "IO_ERROR".to_string(),
                message: message.clone(),
                details: details.clone(),
            },
            AppError::ProcessError { message, details } => AppErrorResponse {
                code: "PROCESS_ERROR".to_string(),
                message: message.clone(),
                details: details.clone(),
            },
            AppError::SandboxViolation { message, details } => AppErrorResponse {
                code: "SANDBOX_VIOLATION".to_string(),
                message: message.clone(),
                details: details.clone(),
            },
            AppError::ParseError { message, details } => AppErrorResponse {
                code: "PARSE_ERROR".to_string(),
                message: message.clone(),
                details: details.clone(),
            },
        };
        response_payload.serialize(serializer)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::IoError {
            message: err.to_string(),
            details: None,
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::ParseError {
            message: err.to_string(),
            details: None,
        }
    }
}

impl From<serde_yaml::Error> for AppError {
    fn from(err: serde_yaml::Error) -> Self {
        AppError::ParseError {
            message: err.to_string(),
            details: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_constructors() {
        let err_v = AppError::validation("invalid field value");
        match err_v {
            AppError::ValidationFailed { ref message, ref details } => {
                assert_eq!(message, "invalid field value");
                assert!(details.is_none());
            }
            _ => panic!("Expected ValidationFailed"),
        }

        let err_io = AppError::io("disk read error");
        match err_io {
            AppError::IoError { ref message, ref details } => {
                assert_eq!(message, "disk read error");
                assert!(details.is_none());
            }
            _ => panic!("Expected IoError"),
        }

        let err_proc = AppError::process("command failed with code 1");
        match err_proc {
            AppError::ProcessError { ref message, ref details } => {
                assert_eq!(message, "command failed with code 1");
                assert!(details.is_none());
            }
            _ => panic!("Expected ProcessError"),
        }

        let err_sand = AppError::sandbox("cannot access host system");
        match err_sand {
            AppError::SandboxViolation { ref message, ref details } => {
                assert_eq!(message, "cannot access host system");
                assert!(details.is_none());
            }
            _ => panic!("Expected SandboxViolation"),
        }

        let err_parse = AppError::parse("unexpected EOF on line 12");
        match err_parse {
            AppError::ParseError { ref message, ref details } => {
                assert_eq!(message, "unexpected EOF on line 12");
                assert!(details.is_none());
            }
            _ => panic!("Expected ParseError"),
        }
    }

    #[test]
    fn test_error_display_formatting() {
        assert_eq!(format!("{}", AppError::validation("foo")), "Validation failed: foo");
        assert_eq!(format!("{}", AppError::io("bar")), "IO error: bar");
        assert_eq!(format!("{}", AppError::process("baz")), "Process error: baz");
        assert_eq!(format!("{}", AppError::sandbox("qux")), "Sandbox violation: qux");
        assert_eq!(format!("{}", AppError::parse("quux")), "Parse error: quux");
    }

    #[test]
    fn test_error_serialization_matches_schema() {
        // ValidationFailed
        let val_err = AppError::validation("schema check failed");
        let serialized_val = serde_json::to_value(&val_err).unwrap();
        assert_eq!(serialized_val["code"], "VALIDATION_FAILED");
        assert_eq!(serialized_val["message"], "schema check failed");
        assert!(serialized_val.get("details").is_none());

        // IoError
        let io_err = AppError::io("file not found");
        let serialized_io = serde_json::to_value(&io_err).unwrap();
        assert_eq!(serialized_io["code"], "IO_ERROR");
        assert_eq!(serialized_io["message"], "file not found");

        // ProcessError
        let proc_err = AppError::process("timed out");
        let serialized_proc = serde_json::to_value(&proc_err).unwrap();
        assert_eq!(serialized_proc["code"], "PROCESS_ERROR");
        assert_eq!(serialized_proc["message"], "timed out");

        // SandboxViolation
        let sand_err = AppError::sandbox("path traversal blocked");
        let serialized_sand = serde_json::to_value(&sand_err).unwrap();
        assert_eq!(serialized_sand["code"], "SANDBOX_VIOLATION");
        assert_eq!(serialized_sand["message"], "path traversal blocked");

        // ParseError
        let parse_err = AppError::parse("invalid token");
        let serialized_parse = serde_json::to_value(&parse_err).unwrap();
        assert_eq!(serialized_parse["code"], "PARSE_ERROR");
        assert_eq!(serialized_parse["message"], "invalid token");
    }

    #[test]
    fn test_error_serialization_with_details() {
        let err_with_details = AppError::ValidationFailed {
            message: "multiple issues".to_string(),
            details: Some(serde_json::json!({ "field": "name", "expected": "string" })),
        };
        let serialized = serde_json::to_value(&err_with_details).unwrap();
        assert_eq!(serialized["code"], "VALIDATION_FAILED");
        assert_eq!(serialized["message"], "multiple issues");
        assert_eq!(serialized["details"]["field"], "name");
        assert_eq!(serialized["details"]["expected"], "string");
    }

    #[test]
    fn test_from_std_io_error() {
        let std_io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "entity missing");
        let app_err: AppError = std_io_err.into();
        match app_err {
            AppError::IoError { message, details } => {
                assert!(message.contains("entity missing"));
                assert!(details.is_none());
            }
            other => panic!("Expected IoError, got {:?}", other),
        }
    }

    #[test]
    fn test_from_serde_json_error() {
        let json_err = serde_json::from_str::<serde_json::Value>("not json {").unwrap_err();
        let app_err: AppError = json_err.into();
        match app_err {
            AppError::ParseError { message, details } => {
                assert!(!message.is_empty());
                assert!(details.is_none());
            }
            other => panic!("Expected ParseError, got {:?}", other),
        }
    }

    #[test]
    fn test_from_serde_yaml_error() {
        let yaml_err = serde_yaml::from_str::<serde_yaml::Value>("unclosed: [").unwrap_err();
        let app_err: AppError = yaml_err.into();
        match app_err {
            AppError::ParseError { message, details } => {
                assert!(!message.is_empty());
                assert!(details.is_none());
            }
            other => panic!("Expected ParseError, got {:?}", other),
        }
    }
}
