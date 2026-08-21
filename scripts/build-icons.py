from pathlib import Path
import shutil
import sys

from PIL import Image


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-icons.py <source.png> <project-root>")

    source = Path(sys.argv[1]).resolve()
    project_root = Path(sys.argv[2]).resolve()
    build_dir = project_root / "build"
    renderer_assets = project_root / "src" / "renderer" / "assets"
    build_dir.mkdir(parents=True, exist_ok=True)
    renderer_assets.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as source_image:
        image = source_image.convert("RGBA")
        if image.width != image.height:
            size = max(image.size)
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
            image = canvas

        master = image.resize((512, 512), Image.Resampling.LANCZOS)
        master.save(build_dir / "icon.png", optimize=True)
        master.save(renderer_assets / "product-icon.png", optimize=True)
        master.save(
            build_dir / "icon.ico",
            format="ICO",
            sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
        )

    shutil.copy2(build_dir / "icon.ico", build_dir / "installerIcon.ico")
    shutil.copy2(build_dir / "icon.ico", build_dir / "installerHeaderIcon.ico")


if __name__ == "__main__":
    main()
