# ADR 007 — El token de invitación no se guarda

**Estado:** aceptada · **Fecha:** 2026-09-07

## Contexto

Un tenant crece invitando gente. La invitación viaja como un enlace con un token, y ese
token da entrada a la empresa con el rol que diga la fila.

## Decisión

**Se guarda el SHA-256 del token, nunca el token.** El original existe exactamente dos
veces: en el enlace que se le entrega a quien invita, y en la URL que abre quien acepta.

Y **la plaza del plan se reserva al INVITAR, no al aceptar**.

## Por qué el hash

Un token de invitación es una credencial. Guardarlo legible significa que cualquiera con
lectura sobre esa tabla —una copia de seguridad mal puesta, un volcado de depuración, un
`select *` en un panel de administración— se convierte en miembro de cualquier empresa que
tenga una invitación pendiente.

SHA-256 sin sal, y eso es correcto aquí aunque suene mal: no es una contraseña elegida por
una persona, son 256 bits de `randomBytes`. No hay diccionario que recorrer ni tabla que
precomputar. Meter bcrypt añadiría coste sin añadir seguridad, y además impediría buscar
la invitación por su hash con un índice.

Si el enlace se pierde, no se recupera: se revoca la invitación y se manda otra. Esa es la
propiedad que se quiere, no un inconveniente que se tolera.

## Por qué la plaza se cobra al invitar

Parece más justo cobrarla al aceptar, y es peor. Con el plan gratuito en dos usuarios, un
propietario podría mandar diez invitaciones y las diez serían válidas; la novena persona
en aceptar se encontraría rechazada por un límite del que nadie le habló, dos días después,
sin nada que pudiera hacer al respecto.

Reservar al invitar mueve ese "no" al único momento en el que alguien puede reaccionar:
cuando lo está pidiendo.

## Consecuencias

Una invitación olvidada retiene una plaza. Se paga con
`app.release_expired_invitations()`, que las libera al caducar, y revocar devuelve la plaza
en el acto.

La aceptación va por `app.accept_invitation()`, una función `SECURITY DEFINER`: quien
acepta **todavía no pertenece** al tenant, así que ninguna política RLS le deja ni ver la
fila que le invita. La función comprueba además que el correo de la sesión coincida con el
invitado — sin eso, un enlace reenviado por descuido deja entrar a quien lo abra primero.

Cuatro motivos de rechazo —inválida, caducada, revocada, ya usada— devuelven **la misma
respuesta**. Distinguirlos convertiría la pantalla de aceptación en un comprobador de
invitaciones ajenas.
