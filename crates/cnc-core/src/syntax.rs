use crate::{Diagnostic, MAX_MAGNITUDE, SourceSpan};

#[derive(Debug)]
pub(crate) struct Word {
    pub letter: char,
    pub value: f64,
    pub integer_literal: bool,
    pub numeric_width: usize,
    pub span: SourceSpan,
}

pub(crate) fn line_span(line: usize, raw: &str) -> SourceSpan {
    SourceSpan {
        line,
        column_start: 1,
        column_end: raw.encode_utf16().count() + 1,
    }
}

/// Scan every character. Byte offsets are used only for slicing; columns are UTF-16.
pub(crate) fn scan(raw: &str, line: usize) -> Result<Vec<Word>, Diagnostic> {
    let mut col = 1;
    let chars: Vec<_> = raw
        .char_indices()
        .map(|(byte, ch)| {
            let item = (byte, ch, col);
            col += ch.len_utf16();
            item
        })
        .collect();
    let span_at = |a: usize, b: usize| SourceSpan {
        line,
        column_start: chars.get(a).map_or(col, |x| x.2),
        column_end: chars.get(b).map_or(col, |x| x.2),
    };
    let mut words = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i].1;
        if ch.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        if ch == ';' {
            break;
        }
        if ch == '(' {
            let start = i;
            i += 1;
            while i < chars.len() && chars[i].1 != ')' {
                if chars[i].1 == '(' {
                    return Err(Diagnostic::error(
                        "NESTED_COMMENT",
                        span_at(i, i + 1),
                        "No se admiten comentarios anidados.",
                    ));
                }
                i += 1;
            }
            if i == chars.len() {
                return Err(Diagnostic::error(
                    "UNCLOSED_COMMENT",
                    span_at(start, i),
                    "Falta cerrar el comentario con ).",
                ));
            }
            i += 1;
            continue;
        }
        if !ch.is_ascii_alphabetic() {
            return Err(Diagnostic::error(
                "INVALID_CHARACTER",
                span_at(i, i + 1),
                format!("Carácter no admitido: {ch}"),
            ));
        }
        let start = i;
        let letter = ch.to_ascii_uppercase();
        i += 1;
        while i < chars.len() && chars[i].1.is_ascii_whitespace() {
            i += 1;
        }
        let number_start = i;
        if i < chars.len() && matches!(chars[i].1, '+' | '-') {
            i += 1;
        }
        let mut digits = 0;
        while i < chars.len() && chars[i].1.is_ascii_digit() {
            i += 1;
            digits += 1;
        }
        if i < chars.len() && chars[i].1 == '.' {
            i += 1;
            while i < chars.len() && chars[i].1.is_ascii_digit() {
                i += 1;
                digits += 1;
            }
        }
        if digits == 0 {
            return Err(Diagnostic::error(
                "MISSING_NUMBER",
                span_at(start, i),
                format!("Falta un número válido después de {letter}."),
            ));
        }
        let from = chars[number_start].0;
        let end = chars.get(i).map_or(raw.len(), |x| x.0);
        let numeric = &raw[from..end];
        // Code/label syntax must be checked before f64 can round a fractional
        // lexeme such as G1.00000000000000001 into the supported integer G1.
        let integer_literal = numeric.bytes().all(|byte| byte.is_ascii_digit());
        let value = numeric.parse::<f64>().unwrap_or(f64::NAN);
        if !value.is_finite() || value.abs() > MAX_MAGNITUDE {
            return Err(Diagnostic::error(
                "NUMBER_RANGE",
                span_at(start, i),
                "Número fuera del rango educativo ±1e9.",
            ));
        }
        words.push(Word {
            letter,
            value,
            integer_literal,
            numeric_width: numeric.len(),
            span: span_at(start, i),
        });
    }
    Ok(words)
}
