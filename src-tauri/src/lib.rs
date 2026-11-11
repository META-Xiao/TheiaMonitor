use std::io::Read;
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Emitter, State};

struct TcpState {
    writer: Arc<Mutex<Option<TcpStream>>>,
    stop: Arc<Mutex<bool>>,
}

// UDP connect only selects a route; no packet is sent to this address.
#[tauri::command]
fn local_ipv4() -> Result<String, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    let ip = socket.local_addr().map_err(|e| e.to_string())?.ip();
    if ip.is_loopback() || ip.is_unspecified() {
        return Err("No LAN IPv4 address available".into());
    }
    Ok(ip.to_string())
}

#[tauri::command]
fn tcp_listen(state: State<TcpState>, app: tauri::AppHandle, port: u16) -> Result<String, String> {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).map_err(|e| format!("bind: {}", e))?;
    let stop = state.stop.clone();
    let writer = state.writer.clone();
    let addr_label = addr.clone();

    *stop.lock().unwrap() = false;

    thread::spawn(move || {
        for incoming in listener.incoming() {
            if *stop.lock().unwrap() { break; }
            if let Ok(mut stream) = incoming {
                let _ = app.emit("tcp-client-connected", addr_label.clone());
                *writer.lock().unwrap() = stream.try_clone().ok();

                let mut buf = [0u8; 4096];
                loop {
                    if *stop.lock().unwrap() { break; }
                    match stream.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => { let _ = app.emit("tcp-data", buf[..n].to_vec()); }
                        Err(_) => break,
                    }
                }
                *writer.lock().unwrap() = None;
                let _ = app.emit("tcp-disconnected", ());
            }
        }
    });

    Ok(addr)
}

#[tauri::command]
fn tcp_send(state: State<TcpState>, data: Vec<u8>) -> Result<usize, String> {
    use std::io::Write;
    let lock = state.writer.lock().map_err(|e| format!("lock: {}", e))?;
    let mut s = lock.as_ref().ok_or("not connected")?.try_clone().map_err(|e| format!("clone: {}", e))?;
    s.write(&data).map_err(|e| format!("send: {}", e))
}

#[tauri::command]
fn tcp_stop(state: State<TcpState>) -> Result<String, String> {
    *state.stop.lock().unwrap() = true;
    *state.writer.lock().unwrap() = None;
    Ok("ok".into())
}

#[tauri::command]
fn tcp_is_connected(state: State<TcpState>) -> bool {
    state.writer.lock().map(|l| l.is_some()).unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TcpState { writer: Arc::new(Mutex::new(None)), stop: Arc::new(Mutex::new(false)) })
        .invoke_handler(tauri::generate_handler![local_ipv4, tcp_listen, tcp_send, tcp_stop, tcp_is_connected])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
