//! The differential test's runner for the fixture: `[name, value]` lines in, verdicts out.
//! With `--date-parse <minutes east of UTC>`, JSON strings in and Date.parse's answers out,
//! for date.mjs.
use std::io::{BufRead, Write};

mod hooks;
mod inputs;

fn main() {
    let mut out = std::io::BufWriter::new(std::io::stdout().lock());
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--date-parse") {
        let offset: i64 = args[2].parse().expect("minutes east of UTC");
        for line in std::io::stdin().lock().lines() {
            let text: String = serde_json::from_str(&line.unwrap()).expect("a JSON string");
            let time = inputs::js_date::date_parse(&text, |local| local - offset * 60_000);
            writeln!(out, "{}", serde_json::json!(time)).unwrap();
        }
        return;
    }
    for line in std::io::stdin().lock().lines() {
        let (name, value): (String, serde_json::Value) =
            serde_json::from_str(&line.unwrap()).expect("a [name, value] line");
        let verdict = inputs::run(&name, value).unwrap_or_else(|| panic!("no schema {name}"));
        writeln!(out, "{verdict}").unwrap();
    }
}
