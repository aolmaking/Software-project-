# API Contracts — Brew & Bake Ordering System

## What Is an API Contract?

An API contract is the **single source of truth** for every HTTP interface in this system.
It defines — before any code is written — exactly what a backend route must return and
exactly what the frontend must send. Neither side needs to read the other's code.

All contracts in this folder are written in **OpenAPI 3.0** (YAML). They are the
engineering equivalent of a legal agreement between the five vertical slices.

---

## Why We Use Contracts

| Without Contract | With Contract |
|---|---|
| Backend changes a field name → frontend silently breaks | Contract is updated first → both sides update together |
| Two members argue about what HTTP status to return | Contract specifies it — end of discussion |
| Tests hardcode assumptions | Tests validate against the contract schema |
| AI tools hallucinate response shapes | AI is given the contract as a spec — output is bounded |

---

## Files in This Folder

| File | Owner | Covers |
|---|---|---|
| `menu.yaml` | Member 1 | `GET /api/menu`, `GET /api/menu/<id>` |
| `cart.yaml` | Member 2 | `GET /api/cart`, `POST /api/cart`, `PATCH /api/cart/<id>`, `DELETE /api/cart/<id>` |
| `order.yaml` | Member 3 | `POST /api/order` |
| `status.yaml` | Member 4 | `GET /api/status`, `PATCH /api/status/<id>` |
| `tracking.yaml` | Member 5 | `GET /api/track/<order_id>` |

---

## Rules for Every Team Member

1. **Contract first, code second.** No route may exist that isn't in the contract.
2. **Never change a contract unilaterally.** All five members must approve schema changes.
3. **Backend routes.py must match the contract exactly** — field names, types, status codes.
4. **Frontend JS must match the contract exactly** — send what it says, read what it says.
5. **Tests validate against the contract** — not against implementation assumptions.
6. All responses use `Content-Type: application/json` (NF-01).
7. All error bodies follow the shared error schema:
   ```json
   { "error": "human-readable message", "code": "MACHINE_CODE" }
   ```

---

## How to Read a YAML Contract

```yaml
paths:
  /api/menu:            ← the endpoint URL (relative to base URL)
    get:                ← HTTP method
      summary: ...      ← one-line description
      parameters: ...   ← query params, path params
      responses:
        '200':          ← HTTP status code (always a string)
          content:
            application/json:
              schema:   ← the exact JSON shape returned
```

---

## Shared Error Schema (all modules must use this)

```yaml
ErrorResponse:
  type: object
  required: [error, code]
  properties:
    error:
      type: string
      description: Human-readable message
    code:
      type: string
      description: Machine-readable error code
```

### Standard Error Codes

| HTTP Status | code value | When to use |
|---|---|---|
| 400 | `EMPTY_CART` | Cart is empty on order placement |
| 400 | `INVALID_STATUS_TRANSITION` | Status not in allowed sequence |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `ITEM_UNAVAILABLE` | Adding unavailable item to cart |
| 422 | `INVALID_QUANTITY` | Quantity outside [1, 20] |
| 422 | `INVALID_INPUT` | Validation failure (name, etc.) |
