# AutoCAD MCP Tool Contracts Reference

This document is the **single authoritative reference** for the tool interface
exposed by `autocad-mcp`. The Engineering Agent must strictly follow these exact
parameter names and types.

Source of Truth: `autocad_mcp/acad_core.py`

---

## Coordinate and Unit Contract

- **Length / Coordinates:** Always in **millimetres (`mm`)**. All point arguments accept `[x, y]` or `[x, y, z]`.
- **Angles:** Always in **degrees (`deg`)**, measured counter-clockwise from the positive X axis.
- **Strict Validation:** Tool schemas declare `additionalProperties: false`, but whether an unknown argument is rejected depends on the MCP **client's** schema enforcement. The current server implementation reads the arguments it knows and does not independently reject unknown keys — so a misspelled parameter can be silently ignored. Always use the exact parameter names documented here.

---

## 1. Session & Connection Tools

### `autocad_status`
- **Purpose:** Verifies connection to a running AutoCAD 2026 session and reports active drawing.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:** `version: string`, `caption: string`, `visible: bool`, `active_document: document_info {name, path, saved, readonly, insunits, insunits_name, coordinates_contract, unit_warning}`
- **Important:** The active drawing is returned under the field **`active_document`** — this tool does NOT return a `drawing` field.

### `list_open_drawings`
- **Purpose:** Lists all documents open in the running AutoCAD session.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:** `drawings: list[document_info]`

### `get_active_drawing_info`
- **Purpose:** Returns metadata and unit configuration for the active drawing.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:** `drawing: {name, path, saved, readonly, insunits, insunits_name, coordinates_contract, unit_warning}`

---

## 2. Document Management Tools

### `create_new_drawing`
- **Purpose:** Creates and activates a new blank drawing in memory from a template.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `template_path` (string, optional): Absolute path to an existing `.dwt` template file.
- **Important:** Does **NOT** accept a `path` parameter. To create a named file on disk, call `create_new_drawing()` followed by `save_drawing_as(path="...")`.
- **Key Output:** `drawing: document_info`, `template: string`

### `open_drawing`
- **Purpose:** Opens an existing DWG or DXF file in the running AutoCAD session.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `path` (string, required): **Absolute** local file path to an existing `.dwg` or `.dxf` file.
- **Key Output:** `drawing: document_info`

### `save_active_drawing`
- **Purpose:** Saves the active drawing in place. Fails if the drawing has no file path yet.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:** `drawing: document_info`

### `save_drawing_as`
- **Purpose:** Saves the active drawing under `ACAD_MCP_OUTPUT_ROOT`.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `path` (string, required): Relative `.dwg` or `.dxf` path below `ACAD_MCP_OUTPUT_ROOT`.
  - `allow_overwrite` (boolean, optional, default: `false`): Must be set to `true` to overwrite an existing checkpoint/file.
- **Key Output:** `path: string`, `format: "dwg" | "dxf"`, `drawing: document_info`

---

## 3. Drawing State & Query Tools

### `list_layers`
- **Purpose:** Lists all layers with color, lock, freeze, and visibility state.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:** `layers: list[{name, color_aci, locked, frozen, visible, linetype}]`

### `create_layer`
- **Purpose:** Creates a layer or returns existing layer with that name.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `name` (string, required): Non-empty layer name.
  - `color_aci` (integer, optional, 1–255): AutoCAD Color Index.
  - `make_current` (boolean, optional): Sets active layer if `true`.
- **Note:** Does **NOT** accept `linetype`, `locked`, or `frozen`. Use `set_layer_properties` for those.
- **Key Output:** `layer: {name, color_aci, current}` — a minimal object, **not** a full `layer_state` (`current` is `true` when this layer is now the active layer).

### `set_current_layer`
- **Purpose:** Sets the active layer for subsequent drawing operations.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `name` (string, required): Existing layer name.
- **Key Output:** `name: string`

### `set_layer_properties`
- **Purpose:** Modifies properties on an existing layer. At least one property is required.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `name` (string, required): Existing layer name.
  - `color_aci` (integer, optional, 1–255)
  - `locked` (boolean, optional)
  - `frozen` (boolean, optional): Cannot freeze the current active layer.
  - `visible` (boolean, optional): `false` turns layer off while remaining thawed.
- **Key Output:** `layer: layer_state`, `changed: list[string]`

### `query_entities`
- **Purpose:** Lists entities in model or paper space up to `max_scan` entities.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:**
  - `space` (string, optional, `"model"` | `"paper"`, default: `"model"`)
  - `limit` (integer, optional, 1–1000, default: `200`): Max entities to return.
  - `object_name` (string, optional): Exact AutoCAD COM class name (e.g. `"AcDbLine"`, `"AcDbPolyline"`, `"AcDbArc"`, `"AcDbRotatedDimension"`).
  - `layer` (string, optional): Filter by exact layer name.
  - `max_scan` (integer, optional, default: `5000`): Stop scanning space after examining this count.
- **Key Output:** `entities: list[{handle, object_name, layer, color_aci, linetype, index}]`, `total_in_space: int`, `scanned: int`, `truncated: bool`

### `list_blocks`
- **Purpose:** Lists block definitions in the active drawing.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:** `blocks: list[{name, is_layout, is_xref, entity_count}]`

### `list_layouts`
- **Purpose:** Lists model and paper space layouts in tab order.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:**
  ```
  layouts: [
    {
      name, tab_order, is_model_tab, active,
      block_name, plot_device, canonical_media,
      paper: { paper_units, width_mm, height_mm }
    }
  ]
  active_layout: string
  ```
  (`active_layout` is the name of the active layout; each entry's `active` flag marks it.)

### `set_entity_layer`
- **Purpose:** Moves an existing entity identified by handle to an existing layer.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `handle` (string, required): Entity handle.
  - `layer` (string, required): Existing layer name.
- **Key Output:** `entity: entity_info`

---

## 4. Geometry Creation Tools

### `draw_line`
- **Purpose:** Adds a line entity.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `start_mm` (point array, required): `[x, y]` or `[x, y, z]` in mm.
  - `end_mm` (point array, required): `[x, y]` or `[x, y, z]` in mm.
  - `layer` (string, optional): Target layer name (must exist).
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbLine", layer, ...}`

### `draw_circle`
- **Purpose:** Adds a circle entity.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `center_mm` (point array, required): `[x, y]` or `[x, y, z]` in mm.
  - `radius_mm` (number, required): Radius in mm ($>0$).
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbCircle", layer, ...}`

### `draw_polyline`
- **Purpose:** Adds a lightweight planar 2D polyline entity.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `vertices_mm` (array of points, required): Minimum 2 vertices. All vertices must share identical Z coordinate.
  - `closed` (boolean, optional, default: `false`).
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbPolyline", layer, ...}`, `vertices: int`, `elevation_mm: float`

### `draw_text`
- **Purpose:** Adds a single-line text entity.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `text` (string, required): Non-empty text string.
  - `insertion_point_mm` (point array, required): `[x, y]` or `[x, y, z]` in mm.
  - `height_mm` (number, required): Text height in mm ($>0$).
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbText", layer, ...}`

### `draw_arc`
- **Purpose:** Adds an arc entity sweeping counter-clockwise.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `center_mm` (point array, required): `[x, y]` or `[x, y, z]` in mm.
  - `radius_mm` (number, required): Radius in mm ($>0$).
  - `start_angle_deg` (number, required): Degrees CCW from +X.
  - `end_angle_deg` (number, required): Degrees CCW from +X (arc sweeps CCW to here). Must not equal start angle.
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbArc", layer, ...}`, `sweep_deg: float`

### `draw_ellipse`
- **Purpose:** Adds an ellipse entity.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `center_mm` (point array, required): `[x, y]` or `[x, y, z]` in mm.
  - `major_axis_mm` (number, required): Semi-major axis length ($>0$).
  - `minor_axis_mm` (number, required): Semi-minor axis length ($>0, \le \text{major\_axis\_mm}$).
  - `rotation_deg` (number, optional, default: `0.0`): Degrees CCW from +X.
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbEllipse", layer, ...}`, `radius_ratio: float`, `rotation_deg: float`

### `draw_point`
- **Purpose:** Adds a point entity.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `point_mm` (point array, required): `[x, y]` or `[x, y, z]` in mm.
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbPoint", layer, ...}`

### `insert_block`
- **Purpose:** Inserts an instance of an existing block definition.
- **Type:** Mutating | **Risk:** 🟡 YELLOW
- **Parameters:**
  - `block_name` (string, required): Existing block definition name.
  - `insertion_point_mm` (point array, required): Insertion point in mm.
  - `scale` (number, optional, default: `1.0`): Non-zero uniform scale multiplier.
  - `rotation_deg` (number, optional, default: `0.0`): Degrees CCW about insertion point.
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbBlockReference", ...}`, `block_name: str`, `scale: float`, `rotation_deg: float`

### `add_linear_dimension`
- **Purpose:** Adds a linear dimension measuring distance between two points.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `start_mm` (point array, required): First measured point in mm.
  - `end_mm` (point array, required): Second measured point in mm.
  - `dimension_line_point_mm` (point array, required): Offset point where the dimension line sits.
  - `orientation` (string, optional, `"aligned"` | `"horizontal"` | `"vertical"` | `"rotated"`, default: `"aligned"`).
  - `rotation_deg` (number, optional): Required and valid **only** when `orientation` is `"rotated"`.
  - `layer` (string, optional): Target layer name.
  - `space` (string, optional, `"model"` | `"paper"`).
- **Key Output:** `entity: {handle, object_name: "AcDbRotatedDimension", ...}`, `measurement_mm: float` (AutoCAD's computed measurement between the supplied points, in mm — it does not read back any other entity's coordinates)

---

## 5. Editing Tools

### `erase_entity`
- **Purpose:** Deletes an entity identified by its AutoCAD handle.
- **Type:** Mutating | **Risk:** 🔴 RED (Human approval required)
- **Parameters:**
  - `handle` (string, required): AutoCAD handle from `query_entities` or a draw tool.
- **Key Output:** `entity: entity_info` (snapshot before deletion)

### `move_entity`
- **Purpose:** Moves an entity by the displacement vector from `from_mm` to `to_mm`.
- **Type:** Mutating | **Risk:** 🟡 YELLOW
- **Parameters:**
  - `handle` (string, required): Entity handle.
  - `from_mm` (point array, required): Base point in mm.
  - `to_mm` (point array, required): Target destination point in mm.
- **Key Output:** `entity: entity_info`, `displacement_mm: list[float]`

### `copy_entity`
- **Purpose:** Copies an entity, optionally offset by `displacement_mm`.
- **Type:** Mutating | **Risk:** 🟢 GREEN
- **Parameters:**
  - `handle` (string, required): Entity handle.
  - `displacement_mm` (point array, optional): Offset vector `[dx, dy, dz]` in mm.
- **Key Output:** `entity: entity_info` (duplicate), `source: entity_info`

---

## 6. View & Feedback Tools

### `zoom_extents`
- **Purpose:** Zooms the active view so visible drawing content fits the window.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:** None (`{}`)
- **Key Output:** `ok: true`

### `capture_screenshot`
- **Purpose:** Captures the running AutoCAD application window and returns it as an MCP image content item.
- **Type:** Read-Only | **Risk:** 🟢 GREEN
- **Parameters:**
  - `width_px` (integer, optional, 200–2400, default: `1400`): Downscale width.
- **Important:** Does **NOT** save to a file path. Returns the image directly in the MCP protocol response (`ImageContent`, `mimeType="image/png"`).
- **Key Output:** `width: int`, `height: int`, `bytes: int`, `was_foreground: bool`. Always verify `was_foreground == true`.
