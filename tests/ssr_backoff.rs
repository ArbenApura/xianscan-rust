use std::time::Duration;
use xianscan_rust::server::ssr::restart_delay;

const S: fn(u64) -> Duration = Duration::from_secs;

#[test]
fn test_backoff_grows_on_rapid_exits() {
    // AGES OF THE EXITS IN THE LAST MINUTE (THE NEWEST, JUST NOW, IS 0 S OLD); EACH RUN LASTED 2 S
    assert_eq!(restart_delay(&[S(0)], S(2)), S(1));
    assert_eq!(restart_delay(&[S(3), S(0)], S(2)), S(2));
    assert_eq!(restart_delay(&[S(8), S(3), S(0)], S(2)), S(4));
    assert_eq!(restart_delay(&[S(15), S(8), S(3), S(0)], S(2)), S(8));

    // CAPPED AT 60 S
    let many: Vec<Duration> = (0..10).map(|i| S(i * 5)).collect();
    assert_eq!(restart_delay(&many, S(1)), S(60));
}

#[test]
fn test_backoff_ignores_exits_older_than_a_minute() {
    assert_eq!(restart_delay(&[S(90), S(70), S(0)], S(2)), S(1));
}

#[test]
fn test_backoff_resets_after_healthy_uptime() {
    assert_eq!(restart_delay(&[S(30), S(10), S(0)], S(120)), S(1));
}
