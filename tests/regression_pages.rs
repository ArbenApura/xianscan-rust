mod common;

use std::path::Path;
use common::get_or_analyze_fixture;

#[test]
fn test_regression_page_679() {
    let img_path = Path::new("tests/fixtures/page_679.jpg");
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_679.jpg")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 679 must have detected regions");

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");
    println!("Page 679 detected text:\n{}", all_text);
    assert!(res.regions.len() >= 4, "Page 679 should have at least 4 grouped paragraphs");
    assert!(all_text.contains("难道") || all_text.contains("张予德"), "Page 679 must contain speech bubble text");
}

#[test]
fn test_regression_user_reported_page_63601() {
    let img_path = Path::new("web/data/uploads/1148/3c5849b7-7925-422d-b53c-24ed6a4a9a07.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 63601 must have detected regions");

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");
    println!("Page 63601 detected text:\n{}", all_text);

    // Verify key characters are recognized accurately
    assert!(all_text.contains("阴阳") || all_text.contains("为炭") || all_text.contains("造化"), "Should recognize '阴阳为炭兮'");
    assert!(all_text.contains("恐惧值") || all_text.contains("嘟"), "Should recognize '恐惧值+0'");
    assert!(all_text.contains("邪教徒") || all_text.contains("世界"), "Should recognize '又是邪教徒'");
}

#[test]
fn test_regression_page_683() {
    let img_path = Path::new("tests/fixtures/page_683.jpg");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_683.jpg")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 683 must have detected regions");
    println!("Page 683 detected {} regions", res.regions.len());
}

#[test]
fn test_regression_page_688() {
    let img_path = Path::new("tests/fixtures/page_688.jpg");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_688.jpg")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 688 must have detected regions");
    println!("Page 688 detected {} regions", res.regions.len());
}

#[test]
fn test_regression_page_63602() {
    let img_path = Path::new("tests/fixtures/page_63602.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_63602.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 63602 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }
}

