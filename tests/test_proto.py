import pytest
from server.proto import PlatformEnum


def test_PlatformEnum():
    assert PlatformEnum.AndroidADB == "AndroidADB"