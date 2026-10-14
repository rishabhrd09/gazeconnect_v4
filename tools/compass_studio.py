"""The Compass studio's service: one PlanModel per plan, and the three views and the exports drawn from it.

Request shapes (floorplan_server routes /api/floorplan/compass/v2/model and /v2/render):
  plan     a CompassPlanV2 (or a v1 compass_map, migrated here)
  view     'plan' | 'top' | 'outside' | 'sheet' | 'cad'
  floor    'ground' | 'first'
  format   'png' (plan, top, outside), 'pdf' (sheet), 'dxf-in' | 'dxf-mm' | 'readme' (cad)
  preset   'front-left' | 'front-right' | 'back-left' | 'back-right' (outside)
  width, height   preview size in pixels (capped), from the studio's drawing area x device scale
  export   true for downloads (exterior supersampled 1.5x, up to 3000 x 2000)
  light    true on light machines: downloads are drawn at preview size, without supersampling
Every response names the plan's modelHash, so a preview and its download are provably the same plan.
"""
from __future__ import annotations

import threading
from collections import OrderedDict

import compass_geometry as geometry
import compass_schema as schema
from compass_resources import set_deadline

VIEWS = {'plan', 'top', 'outside', 'sheet', 'cad'}
FORMATS = {'plan': {'png'}, 'top': {'png'}, 'outside': {'png'}, 'sheet': {'pdf', 'png'}, 'cad': {'dxf-in', 'dxf-mm', 'readme'}}
MIME = {'png': 'image/png', 'pdf': 'application/pdf', 'dxf-in': 'application/dxf', 'dxf-mm': 'application/dxf',
        'readme': 'text/plain'}   # Flask adds "; charset=utf-8" to text types itself.
DEADLINES = {'model': 2, 'plan': 8, 'sheet': 12, 'cad': 8, 'top': 10, 'outside': 15}
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


def render(source, view, floor='ground', fmt='png', theme='warm', preset='front-left', width=1600, height=1000, export=False,
           light=False):
    if view not in VIEWS or fmt not in FORMATS[view]:
        raise ValueError('Unsupported view or format.')
    if theme not in THEMES:
        raise ValueError('Unsupported theme.')
    plan, _ = plan_of(source)
    model = model_for(plan)
    if view != 'outside' and floor not in model['floors']:
        raise ValueError('This floor is not part of the plan yet.')
    for value in (width, height):
        if type(value) is not int or not 240 <= value <= 4000:
            raise ValueError('Choose an image size in pixels.')
    set_deadline(DEADLINES[view])
    if view == 'plan':
        import compass_plan2d
        return compass_plan2d.render_screen(model, floor, theme, width, height), model
    if view == 'sheet':
        import compass_plan2d
        floors = list(model['floors']) if fmt == 'pdf' else [floor]
        return compass_plan2d.render_sheet(model, floors, fmt), model
    if view == 'top':
        import compass_top
        return compass_top.render(model, floor, theme, width, height), model
    if view == 'outside':
        import compass_perspective
        if preset not in compass_perspective.PRESETS:
            raise ValueError('Choose one of the four outside views.')
        if export and not light:
            return compass_perspective.render(model, preset, theme, min(width, 3000), min(height, 2000), scale=1.5), model
        # Light machines (4 GB, or short of memory now) save the outside at preview size without the
        # 1.5x supersampled working image, which alone takes about 190 MB for a 3000 x 2000 export.
        return compass_perspective.render(model, preset, theme, min(width, 2400), min(height, 1600)), model
    import compass_dxf
    if fmt == 'readme':
        return compass_dxf.readme(model, floor), model
    return compass_dxf.export(model, floor, 'in' if fmt == 'dxf-in' else 'mm'), model
