# coding: utf-8
#

import enum

class PlatformEnum(str, enum.Enum):
    AndroidAirTest = "Android"
    AndroidADB = "AndroidADB"
    IOS = "iOS"
