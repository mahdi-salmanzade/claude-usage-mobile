// Config plugin: replace Expo's generated launch storyboard with a blank,
// logo-less dark screen. iOS always requires *a* launch screen, so this is the
// closest to "no splash" — a solid background, no image, instant.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Background matches the app's dark theme bg (#1A1613) to avoid a white flash.
const BLANK_STORYBOARD = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="13122.16" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <dependencies>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="13104.12"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <color key="backgroundColor" red="0.10196078431372549" green="0.086274509803921568" blue="0.074509803921568626" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                        <viewLayoutGuide key="safeArea" id="6Tk-OE-BBY"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
        </scene>
    </scenes>
</document>
`;

module.exports = function withBlankSplash(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        cfg.modRequest.projectName,
        'SplashScreen.storyboard',
      );
      try {
        fs.writeFileSync(file, BLANK_STORYBOARD);
      } catch {
        // storyboard not generated; nothing to replace
      }
      return cfg;
    },
  ]);
};
