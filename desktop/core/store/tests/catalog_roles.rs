//! Collection roles (ADR 0002 section 15.5): every role but recovery-only travels; only `Canonical` is domain data.

use qs_store::{Catalog, Collection, Migration, Role};

fn catalog() -> Catalog {
    let sql = "CREATE TABLE d(id TEXT PRIMARY KEY, rev INTEGER NOT NULL, payload TEXT NOT NULL);
               CREATE TABLE m(id TEXT PRIMARY KEY, rev INTEGER NOT NULL, payload TEXT NOT NULL);
               CREATE TABLE r(id TEXT PRIMARY KEY, rev INTEGER NOT NULL, payload TEXT NOT NULL);";
    Catalog::foundation()
        .extend(
            vec![Migration { version: 2, name: "roles".into(), sql: sql.into() }],
            vec![Collection::new("d"), Collection::new("m").metadata(), Collection::new("r").retained()],
        )
        .unwrap()
}

#[test]
fn roles_default_to_canonical_and_only_recovery_only_does_not_travel() {
    let c = catalog();
    let role = |n: &str| c.collection(n).unwrap().role;
    assert_eq!(role("d"), Role::Canonical);
    assert_eq!(role("m"), Role::Metadata);
    assert_eq!(role("r"), Role::Retained);
    assert_eq!(role("recovery_session"), Role::RecoveryOnly);
    let travelling: Vec<&str> = c.canonical_collections().map(|x| x.name.as_str()).collect();
    for n in ["d", "m", "r", "media_object", "setting"] {
        assert!(travelling.contains(&n), "{n} must travel");
    }
    assert!(!travelling.contains(&"recovery_session"));
}

#[test]
fn only_canonical_role_is_domain_data_for_consumers() {
    let c = catalog();
    let domain: Vec<&str> = c.domain_collections().map(|x| x.name.as_str()).collect();
    assert!(domain.contains(&"d") && domain.contains(&"media_object"));
    for n in ["m", "r", "recovery_session"] {
        assert!(!domain.contains(&n), "{n} is not domain data");
    }
    let spec = c.collection("r").unwrap().to_json();
    assert_eq!(spec["role"], "retained");
}
