"""App-wide constants."""
import pathlib

VERSION = pathlib.Path(__file__).parent.parent.joinpath("VERSION").read_text().strip()
