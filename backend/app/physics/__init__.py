"""High-accuracy reference solutions used to validate the TypeScript engine.

Chain of trust (docs/ARCHITECTURE.md §7): analytic solution → these SciPy
solvers (validated in tests/test_reference.py) → golden fixtures → TypeScript
engine (validated in Vitest).
"""
