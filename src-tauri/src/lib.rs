//! The desktop app: the web app in a window of its own. The pages are served from
//! `http://localhost`, a secure context where the player's Service Worker runs, by the localhost
//! plugin; `CREATOR_SERVE=tauri` serves them from Tauri's own scheme instead, for comparison.
//! Model servers on this machine are reached through Tauri's HTTP client, from Rust, so their
//! CORS settings do not matter.

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// The port the pages are served on, named in `capabilities/default.json` too.
const PORT: u16 = 47615;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let localhost = std::env::var("CREATOR_SERVE").map_or(true, |serve| serve != "tauri");
  // The page the window opens: the app, or `desktop-check/index.html` for the check.
  let page = std::env::var("CREATOR_PAGE").unwrap_or_else(|_| "index.html".into());

  let mut builder = tauri::Builder::default().plugin(tauri_plugin_http::init());
  if localhost {
    builder = builder.plugin(tauri_plugin_localhost::Builder::new(PORT).build());
  }
  builder
    .setup(move |app| {
      let url = if localhost {
        WebviewUrl::External(format!("http://localhost:{PORT}/{page}").parse().expect("a page path"))
      } else {
        WebviewUrl::App(page.into())
      };
      WebviewWindowBuilder::new(app, "main", url)
        .title("Embed My Creator")
        .inner_size(1100.0, 800.0)
        .build()?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running the app");
}
