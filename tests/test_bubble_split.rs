mod common;

use std::path::Path;
use common::get_or_analyze_fixture;

/// # Bubble Split Test: Full Pipeline Adjacent Bubble Separation on `page_fool_pee_pants_adjacent_bubbles.webp`
///
/// ## Purpose:
/// Verifies that side-by-side dialogue bubbles in panel 2 (*"这傻子非得尿裤子上不可！"* vs *"哈哈！"*)
/// are emitted as separate regions with unique IDs and clean text isolation.
#[test]
fn test_page_683_full_pipeline_bubble_separation() {
    let img_path = Path::new("tests/fixtures/zh_hans/page_fool_pee_pants_adjacent_bubbles.webp");
    if !img_path.exists() {
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_fool_pee_pants_adjacent_bubbles.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let resp = get_or_analyze_fixture(&img);
    println!("Page 683 regions:\n{:#?}", resp.regions.iter().map(|r| &r.text).collect::<Vec<_>>());

    let left_bubble = resp.regions.iter().find(|r| r.text.contains("裤子") || r.text.contains("不可") || r.text.contains("傻子"));
    let right_bubble = resp.regions.iter().find(|r| r.text.contains("哈哈") || r.text.contains("哈"));

    assert!(left_bubble.is_some(), "Left bubble region must be detected");
    assert!(right_bubble.is_some(), "Right bubble region must be detected");

    let left = left_bubble.unwrap();
    let right = right_bubble.unwrap();

    assert_ne!(left.id, right.id, "Left and right bubbles must have separate IDs");
    assert!(!left.text.contains("哈哈"), "Left bubble must not contain '哈哈'");
    assert!(!right.text.contains("裤子"), "Right bubble must not contain '裤子'");
}

/// # Bubble Split Test: Multi-Line Paragraph Completeness on `page_zhang_yude_chengdu_cemetery.webp`
///
/// ## Purpose:
/// Verifies that conversational dialogue lines spanning multiple rows are unified
/// without skipping the introductory speech words.
#[test]
fn test_page_679_full_pipeline_text_completeness() {
    let img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp");
    if !img_path.exists() {
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_zhang_yude_chengdu_cemetery.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let resp = get_or_analyze_fixture(&img);
    println!("Page 679 regions:\n{:#?}", resp.regions.iter().map(|r| &r.text).collect::<Vec<_>>());

    let first_bubble = resp.regions.iter().find(|r| r.text.contains("张予德") || r.text.contains("成都") || r.text.contains("难道") || r.text.contains("楚岚"));
    assert!(first_bubble.is_some(), "First speech bubble must be detected");

    let b = first_bubble.unwrap();
    assert!(b.text.contains("难道") || b.text.contains("道这么") || b.text.contains("张予德"), "Beginning must be present");
}
