//! The first domain catalog migration (store schema 1 -> 2; ADR 0002 section 15.4) uses the Foundation's schema
//! ownership unchanged: forward-only, snapshot first, a failed upgrade refuses to run, a newer store is never
//! opened by an older build.

mod common;
use qs_platform::Code;
use qs_store::{Catalog, Migration, OpenOptions, Store};
use qs_testkit::*;
use serde_json::json;
use std::sync::Arc;

#[test]
fn a_foundation_store_upgrades_to_the_product_schema_without_losing_anything() {
    let t = temp_root();
    let foundation = Arc::new(Catalog::foundation());
    {
        let mut s = Store::open(&t.root, foundation.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&foundation, "setting", "theme", json!({"key": "theme", "value": "paper"}))])).unwrap();
    }
    let product = Arc::new(qs_migrate_v1::product_catalog());
    let s = Store::open(&t.root, product.clone(), &OpenOptions::default()).unwrap();
    let n = s.upgrade_notice().expect("an upgrade must be reported");
    assert_eq!((n.from, n.to), (1, 2));
    assert!(n.snapshot.is_file(), "the pre-upgrade snapshot is the rollback source");
    assert_eq!(s.count("setting").unwrap(), 1);
    assert_eq!(s.count("paper").unwrap(), 0);
    assert!(s.check_consistency().unwrap().is_empty());
    // the pre-existing content is unchanged by the upgrade
    let theme = s.read("setting", &json!({"id": "theme"})).unwrap();
    assert_eq!(theme[0].payload, json!({"key": "theme", "value": "paper"}));
}

#[test]
fn a_failing_domain_upgrade_refuses_to_run_and_leaves_the_store_unchanged() {
    let t = temp_root();
    let foundation = Arc::new(Catalog::foundation());
    let hash = {
        let mut s = Store::open(&t.root, foundation.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&foundation, "setting", "theme", json!({"key": "theme", "value": "paper"}))])).unwrap();
        s.state_hash(true).unwrap()
    };
    let good = qs_migrate_v1::product_catalog();
    let broken = Catalog::foundation()
        .extend(
            vec![Migration {
                version: 2,
                name: "broken".into(),
                sql: "CREATE TABLE paper(id TEXT PRIMARY KEY); INSERT INTO nonexistent VALUES(1);".into(),
            }],
            good.collections().iter().filter(|c| c.name == "paper" || c.name == "library_categories").cloned().collect(),
        )
        .unwrap();
    let err = Store::open(&t.root, Arc::new(broken), &OpenOptions::default()).unwrap_err();
    assert_eq!(err.code, Code::UpgradeFailed);
    // the previous build still opens the unchanged store (ADR 0001 section 7)
    let s = Store::open(&t.root, foundation, &OpenOptions::default()).unwrap();
    assert_eq!(s.state_hash(true).unwrap(), hash);
}

#[test]
fn an_older_build_never_opens_a_product_store() {
    let t = temp_root();
    {
        Store::open(&t.root, Arc::new(qs_migrate_v1::product_catalog()), &OpenOptions::default()).unwrap();
    }
    let err = Store::open(&t.root, Arc::new(Catalog::foundation()), &OpenOptions::default()).unwrap_err();
    assert_eq!(err.code, Code::SchemaNewer, "downgrade refused, nothing written");
}

#[test]
fn an_archive_written_by_the_foundation_build_restores_into_the_product_schema() {
    let t = temp_root();
    let foundation = Arc::new(Catalog::foundation());
    let archive = t.dir.path().join("old.qsarchive");
    {
        let mut s = Store::open(&t.root, foundation.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&foundation, "setting", "theme", json!({"key": "theme", "value": "paper"}))])).unwrap();
        qs_archive::create_archive(&s, &archive).unwrap();
    }
    let other = temp_root();
    let mut target = Store::open(&other.root, Arc::new(qs_migrate_v1::product_catalog()), &OpenOptions::default()).unwrap();
    let r = qs_archive::restore_archive(&mut target, &archive).unwrap();
    assert_eq!(r.migrated_from, Some(1), "the staged archive database was migrated forward before activation");
    assert_eq!(target.count("setting").unwrap(), 1);
    assert!(target.check_consistency().unwrap().is_empty());
}
