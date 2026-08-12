// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const SYSTEM_PROMPT: &str = r#"You are a Petri net modeling assistant. Given a natural language description, produce a valid Petri net as a JSON object.

Respond with ONLY a JSON object that matches this schema exactly:

{
  "places": [ { "id": "p1", "label": "P1", "tokens": 0, "x": 100, "y": 100 } ],
  "transitions": [ { "id": "t1", "label": "T1", "x": 300, "y": 100 } ],
  "arcs": [ { "from": "p1", "to": "t1", "weight": 1, "type": "normal" } ]
}

Rules:
- "id" must be unique strings like p1, p2, ... and t1, t2, ...
- "label" is a short human-readable name.
- "tokens" is a non-negative integer (initial marking).
- "x" and "y" are canvas coordinates. Space nodes at least 160px apart horizontally and 120px vertically so they do not overlap. Use a natural left-to-right or top-to-bottom flow layout.
- An arc connects a place to a transition or a transition to a place. Never place-to-place or transition-to-transition. "from" and "to" must reference existing ids.
- "weight" is a positive integer (default 1).
- "type" is one of "normal", "reset", "inhibitor".

Do not wrap the JSON in markdown fences and do not add any text before or after it."#;

#[tauri::command]
async fn generate_petri_net(prompt: String) -> Result<String, String> {
    let api_key = std::env::var("DEEPSEEK_API_KEY")
        .map_err(|_| "DEEPSEEK_API_KEY not found in .env".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(&api_key)
        .json(&serde_json::json!({
            "model": "deepseek-chat",
            "messages": [
                { "role": "system", "content": SYSTEM_PROMPT },
                { "role": "user", "content": prompt }
            ],
            "response_format": { "type": "json_object" },
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv().ok();
    let _ = dotenvy::from_path("../.env").ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, generate_petri_net])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
