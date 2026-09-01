"""Genera los iconos de la PWA a partir de los tokens de marca.

Los PNG de `public/icons` se versionan, asi que esto no hace falta para compilar:
esta aqui para que no sean binarios sin origen. Se ejecuta solo cuando cambie la
marca o haga falta un tamano nuevo.

    pip install pillow
    python tools/make-icons.py

El dibujo es el del icono de la barra superior: un grafico de sectores con una
porcion separada, en blanco, sobre el degradado de marca ($fs-brand ->
$fs-brand-strong, el mismo del boton de registrar).

Se dibuja a 4x y se reduce con LANCZOS: a 72 px los bordes de un sector trazado
directamente salen dentados.
"""

import os
from PIL import Image, ImageDraw

BRAND = (0x2A, 0x5C, 0xB8)
BRAND_STRONG = (0x1F, 0x47, 0x94)
SS = 4  # supermuestreo

# Sector separado: desde las 12 en punto hacia la derecha. PIL mide los angulos
# desde las 3 en punto y en sentido horario.
SLICE_START, SLICE_END = -90, -10
GAP = 3          # grados de aire a cada lado del sector, para que se lea la separacion
OFFSET = 0.10    # cuanto se aleja el sector del centro, en radios


def gradient(size):
    """Degradado diagonal de marca, equivalente al 160deg del boton de registrar.

    Se calcula en pequeno y se amplia: al ser lineal, interpolar da el mismo
    resultado que recorrer millones de pixeles uno a uno.
    """
    n = 64
    small = Image.new("RGB", (n, n))
    px = small.load()
    for y in range(n):
        for x in range(n):
            # Proyeccion sobre la diagonal: 0 arriba-izquierda, 1 abajo-derecha.
            t = (x * 0.35 + y * 0.65) / n
            px[x, y] = tuple(
                round(a + (b - a) * t) for a, b in zip(BRAND, BRAND_STRONG)
            )
    return small.resize((size, size), Image.BILINEAR)


def pie_mask(size, radius):
    """Mascara del grafico: disco sin el sector, mas el sector desplazado."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    cx = cy = size / 2

    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.ellipse(box, fill=255)
    # El hueco se abre con mas angulo que el sector: esa diferencia es la separacion.
    draw.pieslice(box, SLICE_START - GAP, SLICE_END + GAP, fill=0)

    # El sector, alejado del centro en la direccion de su bisectriz.
    import math

    mid = math.radians((SLICE_START + SLICE_END) / 2)
    dx = math.cos(mid) * radius * OFFSET
    dy = math.sin(mid) * radius * OFFSET
    moved = (box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy)
    draw.pieslice(moved, SLICE_START, SLICE_END, fill=255)

    return mask


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
    return mask


def build(size, glyph_ratio, corner_ratio):
    """Un icono: fondo de marca (redondeado o no) con el grafico encima."""
    big = size * SS
    img = gradient(big).convert("RGBA")
    white = Image.new("RGBA", (big, big), (255, 255, 255, 255))
    img = Image.composite(white, img, pie_mask(big, big * glyph_ratio / 2))

    if corner_ratio:
        img.putalpha(rounded_mask(big, big * corner_ratio))
    else:
        img.putalpha(255)

    return img.resize((size, size), Image.LANCZOS)


def main():
    out = os.environ.get(
        "ICON_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "icons"),
    )
    os.makedirs(out, exist_ok=True)

    # Iconos normales: esquinas redondeadas propias, grafico holgado.
    for size in (72, 96, 128, 144, 152, 192, 384, 512):
        build(size, 0.58, 0.22).save(os.path.join(out, f"icon-{size}x{size}.png"))

    # Enmascarables: el fondo llega a los bordes porque el sistema recorta su propia
    # forma, y el grafico se encoge para caber en el circulo seguro del 80%.
    for size in (192, 512):
        build(size, 0.44, 0).save(
            os.path.join(out, f"icon-maskable-{size}x{size}.png")
        )

    # iOS: cuadrado y opaco, que la esquina la redondea el sistema.
    build(180, 0.58, 0).convert("RGB").save(os.path.join(out, "apple-touch-icon.png"))

    for name in sorted(os.listdir(out)):
        print(name, os.path.getsize(os.path.join(out, name)), "bytes")


if __name__ == "__main__":
    main()
