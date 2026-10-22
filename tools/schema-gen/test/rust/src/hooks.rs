//! The fixture's hooks and date type, as a port would write them.
use crate::inputs::orders::CreateOrderInput;
use serde::Deserialize;

/// An ISO 8601 date or date-time, compared by its text in UTC.
#[derive(Debug, Deserialize, PartialEq, PartialOrd)]
pub struct Date(String);

impl Date {
    pub fn parse(text: &str) -> Option<u64> {
        let b = text.as_bytes();
        let n = |from: usize, len: usize| -> Option<u64> {
            let part = b.get(from..from + len)?;
            part.iter().all(u8::is_ascii_digit).then(|| part.iter().fold(0, |n, d| n * 10 + u64::from(d - b'0')))
        };
        let (year, month, day) = (n(0, 4)?, n(5, 2)?, n(8, 2)?);
        if b.get(4) != Some(&b'-') || b.get(7) != Some(&b'-') || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
            return None;
        }
        let rest = &text[10..];
        if rest.is_empty() {
            return Some(year);
        }
        let time = rest.strip_prefix('T')?;
        let zone_at = time.find(['Z', '+', '-']).unwrap_or(time.len());
        let (clock, zone) = time.split_at(zone_at);
        let parts: Vec<&str> = clock.split(':').collect();
        let hour: u64 = parts.first()?.parse().ok()?;
        let minute: u64 = parts.get(1)?.parse().ok()?;
        if parts.len() > 3 || hour > 24 || minute > 59 {
            return None;
        }
        if let Some(seconds) = parts.get(2) {
            let (whole, _) = seconds.split_once('.').unwrap_or((seconds, "0"));
            if whole.len() != 2 || whole.parse::<u64>().ok()? > 59 {
                return None;
            }
        }
        (zone.is_empty() || zone == "Z" || (zone.len() == 6 && zone.as_bytes()[3] == b':')).then_some(year)
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
