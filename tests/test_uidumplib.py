# -*- coding: utf-8 -*-
"""Tests for Android uiautomator XML -> JSON tree conversion (airtest dump output)."""
from weditor.web import uidumplib


def _tree():
    return uidumplib.android_hierarchy_to_json(
        uidumplib.sample_android_page_xml.encode("utf-8"))


def test_sample_tree_structure():
    # android_hierarchy_to_json wraps nodes under the <hierarchy> root:
    # top dict has only {_id, children}; children[0] is the FrameLayout.
    root = _tree()
    assert "_id" in root
    assert set(root.keys()) == {"_id", "children"}
    frame = root["children"][0]
    assert frame["_type"] == "android.widget.FrameLayout"
    assert len(frame["children"]) == 3


def test_attribute_alias_mapping():
    frame = _tree()["children"][0]
    workspace = frame["children"][0]
    assert workspace["resourceId"] == "com.huawei.android.launcher:id/workspace"
    assert workspace["_type"] == "android.view.View"
    assert workspace["scrollable"] is True


def test_bounds_parsed_to_rect():
    frame = _tree()["children"][0]
    assert frame["rect"] == {"x": 0, "y": 0, "width": 720, "height": 1280}
    child = frame["children"][0]["children"][0]["children"][0]
    assert child["text"] == "梦幻西游"
    assert child["rect"]["x"] == 8
    assert child["rect"]["width"] == 176


def test_get_android_hierarchy_accepts_str_and_bytes():
    xml = uidumplib.sample_android_page_xml
    a = uidumplib.get_android_hierarchy(xml)
    b = uidumplib.get_android_hierarchy(xml.encode("utf-8"))
    assert a["children"][0]["rect"] == b["children"][0]["rect"]
    assert len(a["children"]) == len(b["children"])


def test_bool_and_password_conversion():
    frame = _tree()["children"][0]
    assert frame["checkable"] is False
    assert frame["password"] is False
