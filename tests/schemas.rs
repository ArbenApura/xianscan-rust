use xianscan_rust::ml::schemas::{AnalyzeResponse, BoxRect, CleanRequestRegion, Region};

#[test]
fn test_box_rect_serialization() {
    let b = BoxRect { x: 1, y: 2, w: 100, h: 50 };
    let json = serde_json::to_string(&b).unwrap();
    assert_eq!(json, r#"{"x":1,"y":2,"w":100,"h":50}"#);

    let parsed: BoxRect = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed, b);
}

#[test]
fn test_region_serialization() {
    let r = Region {
        id: "r0".to_string(),
        box_: BoxRect { x: 0, y: 0, w: 10, h: 10 },
        polygon: vec![[0, 0], [10, 0], [10, 10], [0, 10]],
        text: "你好".to_string(),
        confidence: 0.95,
        vertical: true,
        angle: 0.0,
        is_title: false,
        is_subtitle: false,
    };

    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains(r#""box":{"x":0,"y":0,"w":10,"h":10}"#));
    assert!(json.contains(r#""text":"你好""#));

    let parsed: Region = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.id, "r0");
    assert_eq!(parsed.text, "你好");
    assert!(parsed.vertical);
}

#[test]
fn test_analyze_response_roundtrip() {
    let r = Region {
        id: "r0".to_string(),
        box_: BoxRect { x: 0, y: 0, w: 10, h: 10 },
        polygon: vec![[0, 0], [10, 0], [10, 10], [0, 10]],
        text: "你好".to_string(),
        confidence: 0.9,
        vertical: true,
        angle: 0.0,
        is_title: false,
        is_subtitle: false,
    };

    let resp = AnalyzeResponse {
        width: 800,
        height: 1200,
        backend: "comic-ctd-rust".to_string(),
        regions: vec![r],
    };

    let json = serde_json::to_string(&resp).unwrap();
    let parsed: AnalyzeResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.width, 800);
    assert_eq!(parsed.height, 1200);
    assert_eq!(parsed.regions.len(), 1);
    assert_eq!(parsed.regions[0].text, "你好");
}

#[test]
fn test_clean_request_region_optional_fields() {
    let json = r#"{"id":"r0","box":{"x":1,"y":2,"w":3,"h":4}}"#;
    let parsed: CleanRequestRegion = serde_json::from_str(json).unwrap();
    assert_eq!(parsed.id, "r0");
    assert!(parsed.box_.is_some());
    assert!(parsed.polygon.is_none());
}

#[test]
fn test_analyze_options_serialization() {
    use xianscan_rust::ml::schemas::AnalyzeOptions;

    let opts = AnalyzeOptions {
        source_lang: Some("zh-Hans".to_string()),
        target_lang: Some("en".to_string()),
    };
    let json = serde_json::to_string(&opts).unwrap();
    assert!(json.contains(r#""source_lang":"zh-Hans""#));
    assert!(json.contains(r#""target_lang":"en""#));

    let parsed: AnalyzeOptions = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.source_lang.as_deref(), Some("zh-Hans"));
    assert_eq!(parsed.target_lang.as_deref(), Some("en"));
}
