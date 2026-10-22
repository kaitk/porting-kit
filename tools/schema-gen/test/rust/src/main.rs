//! The differential test's runner for the fixture: `[name, value]` lines in, verdicts out.
use std::io::{BufRead, Write};

mod hooks;
mod inputs;

fn main() {
    let mut out = std::io::BufWriter::new(std::io::stdout().lock());
    for line in std::io::stdin().lock().lines() {
        let (name, value): (String, serde_json::Value) =
            serde_json::from_str(&line.unwrap()).expect("a [name, value] line");
        let verdict = inputs::run(&name, value).unwrap_or_else(|| panic!("no schema {name}"));
        writeln!(out, "{verdict}").unwrap();
    }
}
