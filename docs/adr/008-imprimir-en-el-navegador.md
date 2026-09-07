# ADR 008 — La nota de entrega se imprime en el navegador, no se genera como PDF

**Estado:** aceptada · **Fecha:** 2026-09-07

## Contexto

Una nota de entrega existe para entregarse: se imprime, se firma y se queda con quien
recibió la mercancía. El plan pedía "PDF de la nota de entrega".

## Decisión

Hay una ruta `/delivery-notes/[id]/print` que sirve el documento **sin el marco de la
aplicación** —sin navegación, sin plan, sin barra de cuenta— maquetado para papel. El
navegador lo imprime o lo guarda como PDF.

No se genera un PDF en el servidor.

## Por qué

Un PDF de servidor exige una de dos cosas, y las dos cuestan más y dan un resultado peor:

**Una librería que dibuja cajas.** `pdf-lib` y similares no maquetan: posicionan. Un
nombre de producto largo no se ajusta solo, una tabla no se parte bien entre páginas, y la
tipografía queda por debajo de lo que cualquier navegador consigue sin esfuerzo. Son
cientos de líneas de código de maquetación que hay que mantener.

**Un navegador sin cabeza.** Da un resultado excelente y no cabe: Chromium empaquetado
supera el límite de tamaño de una función del plan gratuito de Vercel, que es la
plataforma sobre la que este proyecto se compromete a costar cero.

El navegador de quien usa el sistema ya sabe hacer esto, mejor, gratis. Y **"Imprimir" es
un botón que esa persona ya sabe usar** — que importa más de lo que parece en un sistema
pensado para gente que no es experta.

## Consecuencias

**Lo que se paga.** No hay forma de adjuntar el PDF a un correo desde el servidor, ni de
archivarlo automáticamente. Si algún día hace falta, la ruta ya existe y un servicio
externo de "HTML a PDF" puede consumirla — el trabajo de maquetación ya está hecho y no se
tira.

**Lo que se gana.** Cero dependencias nuevas, cero coste por documento, y una salida que se
ve bien porque la hace el motor de renderizado más probado que existe.

La pantalla dice en voz alta cómo guardar el archivo: _"En el diálogo, elige «Guardar como
PDF»"_. No todo el mundo sabe que ese destino está dentro del diálogo de imprimir, y es
exactamente el tipo de cosa que este producto tiene que decir en lugar de suponer.

El aviso **"Documento no fiscal / sin valor fiscal"** va impreso en el pie, no solo en
pantalla. `scripts/check-non-fiscal.sh` vigila el vocabulario del código; esa línea es su
contraparte visible, y hay un test E2E que comprueba que está.
