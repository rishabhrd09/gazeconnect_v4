"""Deterministic word prediction (port of the pinned GazeCompass predictor).

Modules: engine (ranking), worker (request -> response, runs in a worker
process), service (scheduling and lineage), learning (committed-use state),
facade (legacy backend surface), policy (content policy). Nothing is imported
here, so the worker process loads only what a prediction needs.
See docs/deterministic-prediction/README.md.
"""
