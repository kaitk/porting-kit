//! The fixture's hooks and date type, as a port would write them.
use crate::inputs::orders::CreateOrderInput;
use serde::Deserialize;

/// A date as the app's transport revives it, kept as its text.
#[derive(Debug, Deserialize, PartialEq, PartialOrd)]
pub struct Date(String);

impl Date {
    /// V8's Date.parse, for a process in UTC.
    pub fn parse(text: &str) -> Option<i64> {
        crate::inputs::js_date::date_parse(text, crate::inputs::js_date::utc)
    }
}

pub fn even(n: f64) -> bool {
    n % 2.0 == 0.0
}

pub fn range(input: &CreateOrderInput) -> bool {
    input.to.as_ref().is_none_or(|to| *to > input.from)
}

pub fn share_input_transform(value: &mut serde_json::Value) {
    if value.as_str() == Some("") {
        *value = serde_json::Value::Null;
    }
}
