use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use xianscan_rust::server::child_guard;

const HELPER_FLAG: &str = "XIANSCAN_CHILD_GUARD_HELPER";

fn sleeper() -> Command {
    if cfg!(windows) {
        let mut cmd = Command::new("ping");
        cmd.args(["-n", "60", "127.0.0.1"]);
        cmd
    } else {
        let mut cmd = Command::new("sleep");
        cmd.arg("60");
        cmd
    }
}

fn pid_alive(pid: u32) -> bool {
    if cfg!(windows) {
        let out = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .expect("tasklist");
        String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
    } else {
        Command::new("kill").args(["-0", &pid.to_string()]).status().map(|s| s.success()).unwrap_or(false)
    }
}

/// THE TEST BINARY RE-RUNS ITSELF AS A "HELPER PARENT". THE HELPER SPAWNS A LONG SLEEPER THROUGH
/// child_guard, PRINTS ITS PID AND WAITS. THE TEST KILLS THE HELPER HARD (NO CLEANUP CODE RUNS) AND
/// EXPECTS THE SLEEPER TO BE GONE SOON AFTER.
#[test]
fn test_child_dies_with_parent() {
    if std::env::var_os(HELPER_FLAG).is_some() {
        let mut cmd = sleeper();
        cmd.stdout(Stdio::null());
        child_guard::configure_command(&mut cmd, true);
        let child = cmd.spawn().expect("spawn sleeper");
        child_guard::bind_child(&child).expect("bind sleeper");
        println!("SLEEPER_PID={}", child.id());
        std::thread::sleep(Duration::from_secs(120));
        return;
    }

    let exe = std::env::current_exe().unwrap();
    let mut helper = Command::new(exe)
        .args(["--exact", "test_child_dies_with_parent", "--nocapture", "--test-threads=1"])
        .env(HELPER_FLAG, "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn helper");

    let mut sleeper_pid = None;
    for line in BufReader::new(helper.stdout.take().unwrap()).lines() {
        let line = line.unwrap();
        // LIBTEST PRINTS "test <name> ... " FIRST, SO THE MARKER CAN BE MID-LINE
        if let Some(pid) = line.split("SLEEPER_PID=").nth(1) {
            sleeper_pid = Some(pid.trim().parse::<u32>().unwrap());
            break;
        }
    }
    let sleeper_pid = sleeper_pid.expect("helper never reported the sleeper pid");
    assert!(pid_alive(sleeper_pid), "sleeper should be running before the helper dies");

    helper.kill().unwrap();
    let _ = helper.wait();

    let deadline = Instant::now() + Duration::from_secs(3);
    while pid_alive(sleeper_pid) {
        if Instant::now() > deadline {
            // DO NOT LEAVE IT BEHIND EVEN WHEN THE TEST FAILS
            let _ = if cfg!(windows) {
                Command::new("taskkill").args(["/PID", &sleeper_pid.to_string(), "/F"]).status()
            } else {
                Command::new("kill").args(["-9", &sleeper_pid.to_string()]).status()
            };
            panic!("sleeper {sleeper_pid} outlived its parent");
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}
