use serde_json::json;

pub fn system_prompt(net_kind: &str) -> String {
    let common = r#"You are a Petri net modeling assistant. You help the user build Petri nets and answer questions about them.

When the user asks to create, add, remove, or modify a Petri net, respond with ONLY a JSON object (no markdown fences, no extra text before or after) that describes the COMPLETE updated net.

Rules for the net:
- "id" must be unique strings like p1, p2, ... and t1, t2, ...
- "label" is a short human-readable name.
- "tokens" is a non-negative integer (initial marking).
- "x" and "y" are canvas coordinates. Space nodes at least 160px apart horizontally and 120px vertically so they do not overlap. Use a natural left-to-right or top-to-bottom flow layout.
- An arc connects a place to a transition or a transition to a place. Never place-to-place or transition-to-transition. "from" and "to" must reference existing ids.
- "weight" is a positive integer (default 1).
- "type" is one of "normal", "reset", "inhibitor".
- When modifying an existing net, preserve the existing nodes and arcs and return the full net including unchanged parts.

When the user asks a question about the net (behavior, deadlock, reachability, meaning, etc.), answer in plain text. Use the provided "Analysis of current net" when relevant. Keep answers concise and factual."#;

    let extra = match net_kind {
        "timed" => r#"
Current net kind: timed.
JSON shape:
{
  "places": [ { "id": "p1", "label": "P1", "tokens": 0, "x": 100, "y": 100, "capacity": 3, "saturate": false } ],
  "transitions": [ { "id": "t1", "label": "T1", "x": 300, "y": 100, "priority": 0, "interval": { "earliest": 0, "latest": 5, "leftOpen": false, "rightOpen": false }, "core": 0, "suspendable": false } ],
  "arcs": [ { "from": "p1", "to": "t1", "weight": 1, "type": "normal" } ]
}
Use null for unbounded latest / capacity."#,
        "cvn" => r#"
Current net kind: cvn (colored verification net).
JSON shape:
{
  "places": [ { "id": "p1", "label": "ready", "tokens": 1, "x": 100, "y": 100, "cvnPlace": { "class": "control", "sub": "Statement" } } ],
  "transitions": [ { "id": "t1", "label": "lock", "x": 300, "y": 100, "cvnKind": "Lock", "scope": null, "anchors": "", "family": null } ],
  "arcs": [ { "from": "p1", "to": "t1", "weight": 1, "type": "normal", "cvnArc": { "type": "guard", "guard": "x == 0" } } ]
}
cvnPlace.class is "control" (with sub) or "resource" (with resource and optional param).
cvnArc.type is "plain", "guard" (input arcs, e.g. "x >= 1") or "update" (output arcs, e.g. "x = x + 1")."#,
        _ => r#"
Current net kind: pt.
JSON shape:
{
  "places": [ { "id": "p1", "label": "P1", "tokens": 0, "x": 100, "y": 100, "capacity": null, "capacityMode": "reject" } ],
  "transitions": [ { "id": "t1", "label": "T1", "x": 300, "y": 100, "priority": null } ],
  "arcs": [ { "from": "p1", "to": "t1", "weight": 1, "type": "normal" } ]
}"#,
    };

    format!("{common}\n{extra}")
}

#[derive(Clone, Debug)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

pub async fn generate_petri_net(
    prompt: String,
    net_summary: String,
    analysis_summary: String,
    history: Vec<ChatTurn>,
    net_kind: String,
) -> Result<String, String> {
    let api_key = std::env::var("DEEPSEEK_API_KEY")
        .map_err(|_| "DEEPSEEK_API_KEY not found in .env".to_string())?;

    let mut messages = vec![
        json!({ "role": "system", "content": system_prompt(&net_kind) }),
        json!({
            "role": "user",
            "content": format!("Current Petri net:\n{net_summary}\n\nAnalysis of current net:\n{analysis_summary}")
        }),
    ];

    for turn in history {
        let role = if turn.role == "assistant" { "assistant" } else { "user" };
        messages.push(json!({ "role": role, "content": turn.content }));
    }
    messages.push(json!({ "role": "user", "content": prompt }));

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(&api_key)
        .json(&json!({
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": 0.3
        }))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("DeepSeek API error {status}: {text}"));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("bad response: {e}"))?;
    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| "no content in response".to_string())?;

    Ok(content.to_string())
}

/// Extract a JSON Petri-net object from an LLM reply (strips code fences).
pub fn extract_net(text: &str) -> Option<serde_json::Value> {
    let cleaned = text
        .replace("```[a-zA-Z]*", "")
        .replace("```", "")
        .trim()
        .to_string();
    let start = cleaned.find('{')?;
    let end = cleaned.rfind('}')?;
    if end <= start {
        return None;
    }
    let slice = &cleaned[start..=end];
    let parsed: serde_json::Value = serde_json::from_str(slice).ok()?;
    if parsed.get("places").is_some() || parsed.get("transitions").is_some() || parsed.get("arcs").is_some() {
        Some(parsed)
    } else {
        None
    }
}