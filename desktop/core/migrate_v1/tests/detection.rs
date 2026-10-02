//! Detection precedence (ADR 0002 section 5): declared identity beats structure, the envelope version never
//! decides alone, each sub-document is detected independently, and a failing stage stops later stages.

mod common;
use common::*;
use serde_json::{json, Value};

fn edit(name: &str, f: impl FnOnce(&mut Value)) -> Vec<u8> {
    let mut v = fixture(name);
    f(&mut v);
    serde_json::to_vec(&v).unwrap()
}

enum Expect {
    /// accepted; these reportable codes must appear
    Ok(&'static [&'static str]),
    /// blocked; this must be among the blocking codes
    Block(&'static str),
}

fn check(name: &str, bytes: Vec<u8>, expect: Expect) {
    let e = env();
    let src = e.source("src.json", &bytes);
    let p = e.prepare(&src);
    match expect {
        Expect::Ok(reportable) => {
            assert!(!p.blocked, "{name}: unexpectedly blocked: {:?}", p.report["diagnostics"]);
            for c in reportable {
                assert!(has(&p, c), "{name}: expected reportable {c}, got {:?}", codes(&p));
            }
        }
        Expect::Block(code) => {
            assert!(p.blocked, "{name}: should be blocked with {code}");
            assert!(blocking_codes(&p).iter().any(|c| c == code), "{name}: expected {code}, got {:?}", blocking_codes(&p));
        }
    }
}

#[test]
fn the_detection_table() {
    let zip = b"PK\x03\x04 synthetic zip bytes".to_vec();
    let artifact = br#"{"schemaVersion":1,"sourceKey":"quiz-studio-library-v1","rawValue":"{}","reason":"x","preservedAt":"t"}"#.to_vec();
    let cases: Vec<(&str, Vec<u8>, Expect)> = vec![
        ("declared full backup", fixture_bytes("r-min.json"), Expect::Ok(&[])),
        (
            "undeclared but structurally a backup",
            edit("r-min.json", |v| {
                v.as_object_mut().unwrap().remove("documentType");
            }),
            Expect::Ok(&["MIG_ENVELOPE_UNDECLARED"]),
        ),
        (
            "declared as something else",
            edit("r-min.json", |v| v["documentType"] = json!("something-else")),
            Expect::Block("MIG_SOURCE_DECLARED_CONFLICT"),
        ),
        ("declared as a non-string", edit("r-min.json", |v| v["documentType"] = json!(7)), Expect::Block("MIG_SOURCE_DECLARED_CONFLICT")),
        (
            "another quiz-studio artifact",
            edit("r-min.json", |v| v["documentType"] = json!("quiz-studio.quiz-paper")),
            Expect::Block("MIG_SOURCE_WRONG_KIND"),
        ),
        (
            "a single learner response as the main input",
            edit("r-full.json", |v| *v = v["learnerResponses"][0].clone()),
            Expect::Block("MIG_SOURCE_WRONG_KIND"),
        ),
        ("a recovery artifact as the main input", artifact, Expect::Block("MIG_SOURCE_WRONG_KIND")),
        ("a V2 archive (zip)", zip, Expect::Block("MIG_SOURCE_WRONG_KIND")),
        ("array root", b"[1,2,3]".to_vec(), Expect::Block("MIG_SOURCE_NOT_A_BACKUP")),
        (
            "empty paper list is not V1-producible",
            edit("r-min.json", |v| v["library"]["papers"] = json!([])),
            Expect::Block("MIG_SOURCE_NOT_A_BACKUP"),
        ),
        (
            "no library",
            edit("r-min.json", |v| {
                v.as_object_mut().unwrap().remove("library");
            }),
            Expect::Block("MIG_SOURCE_NOT_A_BACKUP"),
        ),
        (
            "envelope version 99 with valid sub-documents",
            edit("r-full.json", |v| v["schemaVersion"] = json!(99)),
            Expect::Ok(&["MIG_ENVELOPE_VERSION_UNEXPECTED"]),
        ),
        (
            "envelope version never rescues a bad sub-document",
            edit("r-full.json", |v| {
                v["schemaVersion"] = json!(1);
                v["learnerResponses"][0]["documentType"] = json!("nope");
            }),
            Expect::Block("MIG_RECORD_KIND_UNKNOWN"),
        ),
        (
            "envelope version 99 never blocks by itself",
            edit("r-min.json", |v| v["schemaVersion"] = json!(99)),
            Expect::Ok(&["MIG_ENVELOPE_VERSION_UNEXPECTED"]),
        ),
        (
            "pre-versioned library",
            edit("r-min.json", |v| {
                v["library"].as_object_mut().unwrap().remove("schemaVersion");
            }),
            Expect::Ok(&["MIG_LIBRARY_PREVERSIONED"]),
        ),
        (
            "unknown library version",
            edit("r-min.json", |v| v["library"]["schemaVersion"] = json!(2)),
            Expect::Block("MIG_RECORD_KIND_UNKNOWN"),
        ),
        (
            "history section absent",
            edit("r-full.json", |v| {
                v.as_object_mut().unwrap().remove("history");
            }),
            Expect::Ok(&["MIG_SECTION_ABSENT"]),
        ),
        (
            "learnerResponses section absent (reviews then cannot resolve)",
            edit("r-full.json", |v| {
                v.as_object_mut().unwrap().remove("learnerResponses");
            }),
            Expect::Block("MIG_REF_UNRESOLVED"),
        ),
        (
            "translationLibrary section absent",
            edit("r-min.json", |v| {
                v.as_object_mut().unwrap().remove("translationLibrary");
            }),
            Expect::Ok(&["MIG_SECTION_ABSENT"]),
        ),
        (
            "mediaAssets section absent",
            edit("r-min.json", |v| {
                v.as_object_mut().unwrap().remove("mediaAssets");
            }),
            Expect::Ok(&["MIG_SECTION_ABSENT"]),
        ),
        (
            "legacy assets alias",
            edit("r-full.json", |v| {
                let m = v["mediaAssets"].take();
                v.as_object_mut().unwrap().remove("mediaAssets");
                v["assets"] = m;
            }),
            Expect::Ok(&["MIG_ASSETS_ALIAS_USED"]),
        ),
        (
            "both asset lists present",
            edit("r-full.json", |v| {
                v["assets"] = v["mediaAssets"].clone();
            }),
            Expect::Block("MIG_SECTION_SHAPE"),
        ),
        ("history is not an array", edit("r-min.json", |v| v["history"] = json!({})), Expect::Block("MIG_SECTION_SHAPE")),
        (
            "learnerResponses is not an array",
            edit("r-min.json", |v| v["learnerResponses"] = json!("x")),
            Expect::Block("MIG_SECTION_SHAPE"),
        ),
        ("categories is not an array", edit("r-min.json", |v| v["library"]["categories"] = json!("x")), Expect::Block("MIG_SECTION_SHAPE")),
        (
            "unknown learner response documentType",
            edit("r-full.json", |v| v["learnerResponses"][0]["documentType"] = json!("x")),
            Expect::Block("MIG_RECORD_KIND_UNKNOWN"),
        ),
        (
            "unknown material type",
            edit("r-full.json", |v| v["learnerResponses"][0]["material"]["type"] = json!("exam")),
            Expect::Block("MIG_RECORD_KIND_UNKNOWN"),
        ),
        (
            "unknown teacher review documentType",
            edit("r-full.json", |v| v["teacherReviews"][0]["documentType"] = json!("x")),
            Expect::Block("MIG_RECORD_KIND_UNKNOWN"),
        ),
        (
            "unknown translation document documentType",
            edit("r-full.json", |v| v["translationLibrary"]["documents"][0]["documentType"] = json!("x")),
            Expect::Block("MIG_RECORD_KIND_UNKNOWN"),
        ),
        (
            "paper without id",
            edit("r-min.json", |v| {
                v["library"]["papers"][0].as_object_mut().unwrap().remove("id");
            }),
            Expect::Block("MIG_RECORD_UNIDENTIFIABLE"),
        ),
        (
            "paper title of the wrong type",
            edit("r-min.json", |v| v["library"]["papers"][0]["title"] = json!(5)),
            Expect::Block("MIG_SECTION_SHAPE"),
        ),
    ];
    for (name, bytes, expect) in cases {
        check(name, bytes, expect);
    }
}

#[test]
fn a_failing_stage_stops_later_stages_but_reports_all_of_its_own_problems() {
    // two reader-stage problems (duplicate key + lone surrogate) AND a detection-stage problem (bad documentType)
    let bytes =
        br#"{"documentType":"nope","schemaVersion":1,"library":{"papers":[{"id":"p","title":"a\ud800b","questions":[]}]},"library":{}}"#
            .to_vec();
    let e = env();
    let p = e.prepare(&e.source("src.json", &bytes));
    assert!(p.blocked);
    let cs = blocking_codes(&p);
    assert!(cs.contains(&"MIG_SOURCE_DUPLICATE_KEY".to_string()) && cs.contains(&"MIG_SOURCE_LONE_SURROGATE".to_string()), "{cs:?}");
    assert!(!cs.iter().any(|c| c == "MIG_SOURCE_DECLARED_CONFLICT"), "later stages must not run past a failing stage: {cs:?}");
}

#[test]
fn identical_inputs_yield_identical_classification() {
    let a = env();
    let b = env();
    let pa = a.prepare(&a.source("x.json", &fixture_bytes("r-full.json")));
    let pb = b.prepare(&b.source("x.json", &fixture_bytes("r-full.json")));
    assert_eq!(pa.report["classification"], pb.report["classification"]);
    assert_eq!(pa.report["classification"]["declared"], true);
    assert_eq!(pa.report["classification"]["sections"]["history"], true);
}
