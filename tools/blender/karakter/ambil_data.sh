#!/bin/sh
# Ambil data MakeHuman (CC0) yang dibutuhkan build.py: mesh dasar, morf, rig, tekstur topeng kulit, dan model mata.
# Hasilnya masuk tools/blender/karakter/data (tidak ikut di-commit, sekitar 90 MB).
set -e
cd "$(dirname "$0")"; mkdir -p data; cd data
if [ ! -d mpfb2 ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/mpfb2.git
  (cd mpfb2 && git sparse-checkout set src/mpfb/data/3dobjs src/mpfb/data/mesh_metadata src/mpfb/data/rigs/standard src/mpfb/data/textures src/mpfb/data/targets)
fi
if [ ! -d makehuman ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/makehuman.git
  (cd makehuman && git sparse-checkout set makehuman/data/eyes)
fi
echo "Data siap di $(pwd)"
