"""Pose orang ringan dengan rumus yang sama seperti vertex shader di drive3d.js (ANIM_GLSL), tapi di Python.

Dipakai untuk pengendara motor yang duduk (tools/blender/motor/ringan.py) dan untuk memeriksa pose di Blender.
Ruang Blender sesudah ringan.siapkan(): z atas, depan +Y, sisi L = +x. Sudut positif = ke depan (paha, lengan).
sudut: dict dengan kunci hipL, hipR, kneeL, kneeR, shL, shR, elbL, elbR (radian), plus opsional 'badan' (condong ke depan,
diputar di sekitar pinggul untuk titik yang bukan kaki).
"""
import numpy as np


def rx(P, o, a):
    """Putar titik P (N×3) di sekitar sumbu X yang melewati o, sudut a per titik (N,)."""
    s, c = np.sin(a), np.cos(a); q = P - o
    return o + np.stack([q[:, 0], q[:, 1] * c - q[:, 2] * s, q[:, 1] * s + q[:, 2] * c], 1)


def pose(P, ch, J, sudut, normal=False):
    """P: titik (N×3) satu bagian, ch: bobot 8 saluran, J: sendi, sudut: dict. Urutan sama dengan shader."""
    z = np.zeros(3)
    o = (lambda k: z) if normal else (lambda k: np.array(J[k]))
    g = lambda k: sudut.get(k, 0.0)
    P = rx(P, o('kneeL'), g('kneeL') * ch['_KNEEL']); P = rx(P, o('kneeR'), g('kneeR') * ch['_KNEER'])
    P = rx(P, o('hipL'), g('hipL') * ch['_LEGL']); P = rx(P, o('hipR'), g('hipR') * ch['_LEGR'])
    P = rx(P, o('elbL'), g('elbL') * ch['_ELBL']); P = rx(P, o('elbR'), g('elbR') * ch['_ELBR'])
    P = rx(P, o('shL'), g('shL') * ch['_ARML']); P = rx(P, o('shR'), g('shR') * ch['_ARMR'])
    if sudut.get('badan'):
        # badan condong: titik selain kaki berputar di sekitar pinggul (ke depan = sudut negatif di sumbu X untuk ke atas)
        kaki = np.clip(ch['_LEGL'] + ch['_LEGR'], 0, 1)
        hip = z if normal else (np.array(J['hipL']) + np.array(J['hipR'])) / 2
        P = rx(P, hip, -sudut['badan'] * (1 - kaki))
    return P


def terapkan(obs, chs, J, sudut):
    """Pose semua objek bagian di tempat (mesh diubah)."""
    for bag, ob in obs.items():
        me = ob.data; n = len(me.vertices)
        P = np.zeros(n * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
        P = pose(P, chs[bag], J, sudut)
        me.vertices.foreach_set('co', P.ravel()); me.update()
