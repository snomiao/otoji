// swift-tools-version: 6.1
// Small helper bundled inside otoji.app: opens System Settings on a privacy
// pane and floats PermissionFlow's "drag otoji into this list" panel beside it.
import PackageDescription

let package = Package(
    name: "otoji-permission-guide",
    platforms: [.macOS(.v13)],
    dependencies: [
        // MIT, vetted (no network, no extra permissions). Pinned to a reviewed commit.
        .package(
            url: "https://github.com/jaywcjlove/PermissionFlow.git",
            revision: "cb96db4bfd2342e8d8c56f2a7d51ca65b8aed6e2"
        ),
    ],
    targets: [
        .executableTarget(
            name: "otoji-permission-guide",
            dependencies: [.product(name: "PermissionFlow", package: "PermissionFlow")]
        ),
    ]
)
