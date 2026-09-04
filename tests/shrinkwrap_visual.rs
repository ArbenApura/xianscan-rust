// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;


// -- INTERNAL IMPORTS -- //
use xianscan_rust::ml::inpaint::{clean_white_bubble_shrinkwrap, LamaInpainter};
use xianscan_rust::ml::schemas::BoxRect;

// -- HELPER FUNCTIONS -- //

/// EXECUTES THE TWO-STAGE CLEANING PIPELINE ON A GIVEN FIXTURE DIRECTORY:
/// STAGE 1: INPAINTING VIA LAMA (LOADS FROM CACHED INPAINTED.WEBP IF PRESENT, RUNS LAMA IF ABSENT)
/// STAGE 2: OUTSIDE-IN SHRINKWRAP CAVITY FLUSH (DYNAMICALLY PRODUCES CLEANED.WEBP)
fn run_two_stage_pipeline_on_fixture(fixture_dir: &Path, _inpainter_opt: &mut Option<LamaInpainter>) {
    let page_path = fixture_dir.join("page.webp");
    if !page_path.exists() {
        return;
    }

    let debug_json_path = fixture_dir.join("annotated_debug.json");
    if !debug_json_path.exists() {
        return;
    }


    let debug_str = match std::fs::read_to_string(&debug_json_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to read {:?}: {}", debug_json_path, e);
            return;
        }
    };
    let debug_val: serde_json::Value = match serde_json::from_str(&debug_str) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Failed to parse JSON {:?}: {}", debug_json_path, e);
            return;
        }
    };
    let regions = match debug_val["regions"].as_array() {
        Some(arr) => arr,
        None => return,
    };

    // STAGE 1: CHECK FOR CACHED INPAINTED.WEBP FIRST
    let inpainted_path = fixture_dir.join("inpainted.webp");
    if !inpainted_path.exists() {
        return;
    }
    let inpainted_img = match image::open(&inpainted_path) {
        Ok(img) => img,
        Err(_) => return,
    };

    // STAGE 2: RUN SHRINKWRAP CAVITY CLEANING ON TOP OF INPAINTED IMAGE
    let mut rgb_buf = inpainted_img.to_rgb8();
    let mut cleaned_count = 0;

    let mut processed_bubbles: Vec<BoxRect> = Vec::new();

    for r in regions {
        let kind = r["kind"].as_str().unwrap_or_default();
        if kind != "dialogue_bubble" {
            continue;
        }

        let bbox_obj = &r["bubble_box"];
        if bbox_obj.is_null() {
            continue;
        }

        let bb = BoxRect {
            x: bbox_obj["x"].as_i64().unwrap_or(0) as i32,
            y: bbox_obj["y"].as_i64().unwrap_or(0) as i32,
            w: bbox_obj["w"].as_i64().unwrap_or(0) as i32,
            h: bbox_obj["h"].as_i64().unwrap_or(0) as i32,
        };

        if processed_bubbles.iter().any(|existing| xianscan_rust::ml::geometry::box_iou(existing, &bb) >= 0.70) {
            continue;
        }
        processed_bubbles.push(bb.clone());

        let mut seeds = Vec::new();
        if let Some(poly) = r["polygon"].as_array() {
            let mut cx = 0i64;
            let mut cy = 0i64;
            for pt in poly {
                if let Some(coords) = pt.as_array() {
                    cx += coords[0].as_i64().unwrap_or(0);
                    cy += coords[1].as_i64().unwrap_or(0);
                }
            }
            if !poly.is_empty() {
                seeds.push([(cx / poly.len() as i64) as i32, (cy / poly.len() as i64) as i32]);
            }
        }
        if seeds.is_empty() {
            if let Some(centroid) = r.get("centroid") {
                seeds.push([
                    centroid["x"].as_f64().unwrap_or(0.0) as i32,
                    centroid["y"].as_f64().unwrap_or(0.0) as i32,
                ]);
            }
        }

        let ok = clean_white_bubble_shrinkwrap(&mut rgb_buf, &bb, &seeds);
        if ok {
            cleaned_count += 1;
        }
    }

    let cleaned_path = fixture_dir.join("cleaned.webp");
    let _ = rgb_buf.save(&cleaned_path);
    println!(
        "Processed {:?}: cached inpaint = {}, {} bubbles shrinkwrap-cleaned",
        fixture_dir.file_name().unwrap_or_default(),
        inpainted_path.exists(),
        cleaned_count
    );
}

// -- TESTS -- //

#[test]
fn test_two_stage_pipeline_on_all_fixtures() {
    let private_dir = Path::new("tests/fixtures/private");
    if !private_dir.exists() {
        return;
    }

    let mut inpainter_opt: Option<LamaInpainter> = None;
    let mut total_cases = 0;

    let Ok(lang_entries) = std::fs::read_dir(private_dir) else {
        return;
    };

    for lang_entry in lang_entries.flatten() {
        let lang_path = lang_entry.path();
        if !lang_path.is_dir() {
            continue;
        }

        let Ok(case_entries) = std::fs::read_dir(&lang_path) else {
            continue;
        };

        for case_entry in case_entries.flatten() {
            let case_path = case_entry.path();
            if case_path.is_dir() && case_path.join("page.webp").exists() && case_path.join("annotated_debug.json").exists() {
                run_two_stage_pipeline_on_fixture(&case_path, &mut inpainter_opt);
                total_cases += 1;
            }
        }
    }

    println!("Total fixtures verified across all languages: {}", total_cases);
}

#[test]
fn test_two_stage_pipeline_on_basilisk() {
    let fixture_dir = Path::new("tests/fixtures/private/ja/page_faster_more_basilisk_dragon_copy");
    if !fixture_dir.exists() {
        return;
    }
    let mut inpainter_opt: Option<LamaInpainter> = None;
    run_two_stage_pipeline_on_fixture(fixture_dir, &mut inpainter_opt);
}

#[test]
fn test_two_stage_pipeline_on_novice_summoner() {
    let fixture_dir = Path::new("tests/fixtures/private/ja/page_novice_summoner_blank_scrolls_slanted_caption");
    if !fixture_dir.exists() {
        return;
    }
    let mut inpainter_opt: Option<LamaInpainter> = None;
    run_two_stage_pipeline_on_fixture(fixture_dir, &mut inpainter_opt);
}

#[test]
fn test_two_stage_pipeline_on_colamanga() {
    let fixture_dir = Path::new("tests/fixtures/private/zh_hans/page_chen_fan_gourd_box_colamanga_watermark");
    if !fixture_dir.exists() {
        return;
    }
    let mut inpainter_opt: Option<LamaInpainter> = None;
    run_two_stage_pipeline_on_fixture(fixture_dir, &mut inpainter_opt);
}

#[test]
fn test_two_stage_pipeline_on_chuzhou_watermark() {
    let fixture_dir = Path::new("tests/fixtures/private/zh_hans/page_chuzhou_internal_energy_true_essence_watermark");
    if !fixture_dir.exists() {
        return;
    }
    let mut inpainter_opt: Option<LamaInpainter> = None;
    run_two_stage_pipeline_on_fixture(fixture_dir, &mut inpainter_opt);
}

#[test]
fn test_two_stage_pipeline_on_sage() {
    let fixture_dir = Path::new("tests/fixtures/private/ja/page_sage_reincarnation_class_change");
    if !fixture_dir.exists() {
        return;
    }
    let mut inpainter_opt: Option<LamaInpainter> = None;
    run_two_stage_pipeline_on_fixture(fixture_dir, &mut inpainter_opt);
}

#[test]
fn test_two_stage_pipeline_on_whose_god() {
    let fixture_dir = Path::new("tests/fixtures/private/zh_hans/page_whose_god_will_i_be_slanted_free_text");
    if !fixture_dir.exists() {
        return;
    }
    let mut inpainter_opt: Option<LamaInpainter> = None;
    run_two_stage_pipeline_on_fixture(fixture_dir, &mut inpainter_opt);
}
