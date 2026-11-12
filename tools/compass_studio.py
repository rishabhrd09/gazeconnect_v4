"""The Compass studio's service: one PlanModel per plan, and the two views and the exports drawn from it.

Request shapes (floorplan_server routes /api/floorplan/compass/v2/model and /v2/render):
  plan     a CompassPlanV2 (or a v1 compass_map, migrated here)
  view     'plan' | 'top' | 'sheet' | 'cad'; 'top' is the furnished model from above (plan25d.py), shown in
           the studio as Model look
  floor    'ground' | 'first'
  format   'png' (plan, top), 'pdf' (sheet), 'dxf-in' | 'dxf-mm' | 'readme' (cad)
  width, height   preview size in pixels (capped), from the studio's drawing area x device scale
  fit      'width' (full screen): the plan or top view as tall as filling the width needs
The studio's Outside view and its earlier top view were removed on 12 Nov 2026 (maintainer request).
Every response names the plan's modelHash, so a preview and its download are provably the same plan.
"""
from __future__ import annotations

import threading
from collections import OrderedDict

import compass_geometry as geometry
import compass_schema as schema
from compass_resources import set_deadline

VIEWS = {'plan', 'top', 'sheet', 'cad'}
FORMATS = {'plan': {'png'}, 'top': {'png'}, 'sheet': {'pdf', 'png'}, 'cad': {'dxf-in', 'dxf-mm', 'readme'}}
MIME = {'png': 'image/png', 'pdf': 'application/pdf', 'dxf-in': 'application/dxf', 'dxf-mm': 'application/dxf',
        'readme': 'text/plain'}   # Flask adds "; charset=utf-8" to text types itself.
DEADLINES = {'model': 2, 'plan': 8, 'sheet': 12, 'cad': 8, 'top': 10}
THEMES = ('warm', 'dark', 'midnight-navy', 'serene-warm', 'serene-dark', 'serene-midnight-navy')

_models = OrderedDict()
_lock = threading.Lock()


def plan_of(source):
    """A normalised CompassPlanV2 from a request: v2 as is, v1 maps migrated (with their notices)."""
    if not isinstance(source, dict):
        raise schema.PlanError('A Compass plan is required.')
    if 'schema' in source or 'version' in source:
        return schema.normalise(source), []
    v1 = source.get('compass_map', source)
    if not isinstance(v1, dict) or not isinstance(v1.get('plot'), dict) or not isinstance(v1.get('ground_floor'), dict):
        raise schema.PlanError('A Compass plan is required.')
    return schema.migrate_v1(v1)


def model_for(plan):
    """The PlanModel for a plan, from a small cache keyed by the plan itself (models are immutable)."""
    key = schema.intent_hash(plan)
    with _lock:
        if key in _models:
            _models.move_to_end(key)
            return _models[key]
    set_deadline(DEADLINES['model'])
    model = geometry.build(plan)
    with _lock:
        _models[key] = model
        while len(_models) > 4:
            _models.popitem(last=False)
    return model


def summary(source):
    plan, notices = plan_of(source)
    model = model_for(plan)
    out = geometry.summary(model)
    out['notices'] = notices
    out['plan'] = plan
    out['floorsDrawn'] = list(model['floors'])
    return out


def render(source, view, floor='ground', fmt='png', theme='warm', width=1600, height=1000, fit='contain'):
    """`fit='width'` (the full screen's fill-width view) draws the plan or top view as tall as filling the width needs."""
    if view not in VIEWS or fmt not in FORMATS[view]:
        raise ValueError('Unsupported view or format.')
    if theme not in THEMES:
        raise ValueError('Unsupported theme.')
    if fit not in ('contain', 'width'):
        raise ValueError('Unsupported fit.')
    plan, _ = plan_of(source)
    model = model_for(plan)
    if floor not in model['floors']:
        raise ValueError('This floor is not part of the plan yet.')
    for value in (width, height):
        if type(value) is not int or not 240 <= value <= 4000:
            raise ValueError('Choose an image size in pixels.')
    set_deadline(DEADLINES[view])
    if view == 'plan':
        import compass_plan2d
        return compass_plan2d.render_screen(model, floor, theme, width, height, fit=fit), model
    if view == 'sheet':
        import compass_plan2d
        floors = list(model['floors']) if fmt == 'pdf' else [floor]
        return compass_plan2d.render_sheet(model, floors, fmt), model
    if view == 'top':
        import plan25d
        import plan25d_adapter
        from compass_plan2d import FILL_MAX_HEIGHT, THEMES as PALETTES, luminance
        look = 'dark' if luminance(PALETTES[theme][0]) < .45 else 'light'
        drawn = plan25d_adapter.floor_plan(model, floor)
        w = min(max(width, 480), 2400)
        # Fill width draws as tall as the plot needs, at most FILL_MAX_HEIGHT (then fitted to it), as the plan does.
        if fit == 'width':
            h = None if plan25d.fill_height(drawn, w) <= FILL_MAX_HEIGHT else FILL_MAX_HEIGHT
        else:
            h = min(max(height, 320), FILL_MAX_HEIGHT)
        png, _ = plan25d.render_floor(drawn, w, h, look)
        return png, model
    import compass_dxf
    if fmt == 'readme':
        return compass_dxf.readme(model, floor), model
    return compass_dxf.export(model, floor, 'in' if fmt == 'dxf-in' else 'mm'), model
