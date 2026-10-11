package io.novawerk.psygym.screenshot

import io.novawerk.psygym.domain.screenshot.ScreenshotMode
import io.novawerk.psygym.domain.settings.AppLanguage

/** What [ScreenshotHooks] hands MainActivity when launched for store screenshots. */
class ScreenshotLaunch(val mode: ScreenshotMode, val language: AppLanguage?)
