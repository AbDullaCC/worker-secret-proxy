# Control-Plane Schema (ERD)

```mermaid
erDiagram
    Tenant {
        string id PK
        string name
        string createdAt
    }

    ExternalTarget {
        string id PK
        string tenantId FK
        string name "slug, e.g. stripe"
        string baseUrl
        string createdAt
    }

    SecretVersion {
        string id PK
        string targetId FK
        int    version
        string encryptedValue
        string createdAt
        string revokedAt "nullable"
    }

    CredentialBinding {
        string id PK
        string targetId FK
        string secretVersionId FK
        string headerName "e.g. Authorization"
        string headerTemplate "e.g. Bearer double-curly-open stripe_api_key double-curly-close"
    }

    AuditEvent {
        string id PK
        string tenantId FK
        string targetId FK
        string action "proxy_request | secret_rotated | ..."
        string timestamp
        json   metadata
    }

    Tenant ||--o{ ExternalTarget : "owns"
    ExternalTarget ||--o{ SecretVersion : "has versions"
    ExternalTarget ||--o{ CredentialBinding : "bound to"
    SecretVersion ||--o{ CredentialBinding : "referenced by"
    Tenant ||--o{ AuditEvent : "generates"
    ExternalTarget ||--o{ AuditEvent : "related to"
```

## Relationships

| From           | To                | Cardinality | Description                                                                |
| -------------- | ----------------- | ----------- | -------------------------------------------------------------------------- |
| Tenant         | ExternalTarget    | 1 → many    | A tenant registers multiple third-party APIs                               |
| ExternalTarget | SecretVersion     | 1 → many    | Each target can have multiple secret versions (for rotation)               |
| ExternalTarget | CredentialBinding | 1 → many    | Bindings define _how_ the secret is injected (which header, what template) |
| SecretVersion  | CredentialBinding | 1 → many    | A binding points to the active secret version                              |
| Tenant         | AuditEvent        | 1 → many    | Every proxy call and control-plane mutation is logged                      |
| ExternalTarget | AuditEvent        | 1 → many    | Audit events reference the target involved                                 |
