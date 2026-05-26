#!/usr/bin/env bash
# set -x

wget 'https://www.tuhs.org/Archive/Documentation/TUHS/Mail_list/' -O /tmp/tuhsml.html

has_new_mlfile=0
for l in $(grep -o 'href="[^"]*txt[\.gz]*' /tmp/tuhsml.html | cut -c7-); do
    mlfile=$(basename "${l}")
    if [ -e "${mlfile}" ]; then
        continue
    fi
    url="https://www.tuhs.org/Archive/Documentation/TUHS/Mail_list/${l}"
    wget "${url}" -O "${mlfile}.tmp"
    if [ -e "${mlfile}.tmp" ] && [[ $(file "${mlfile}.tmp") != *"empty"* ]]; then
        has_new_mlfile=1
        mv "${mlfile}.tmp" "${mlfile}"
    fi
done

# extract gz file
for i in *.gz; do
    i2=${i//.gz/}
    if [ -e "${i2}" ]; then
        continue
    fi
    gzip -fdk "${i}"
done

# generate whole year maillist ordered by time
curyear=$(date '+%Y')
i=1989
while [ $i -lt ${curyear} ]; do
    i=$((i+1))                  # starts from 1990

    s=''
    for j in January February March April May July June August September October November December; do
        mlfile="${i}-${j}.txt"
        if [ ! -e "${mlfile}" ]; then
            continue
        fi
        s="${s} ${mlfile}"
    done

    if [ "${s}" == '' ]; then
        continue
    fi

    mlfile_wholeyear="${i}.txt"
    if [ ${i} -eq ${curyear} ] || [ ! -e "${mlfile_wholeyear}" ]; then
        cat ${s} > "${mlfile_wholeyear}"
    fi
done

# generate index.html, always overwrite
index_file=index.html

echo '<html style="font-family: menlo, courier, monospace; font-size: 13;"><body>' > "${index_file}"
i=1989
s=''
while [ $i -lt ${curyear} ]; do
    i=$((i+1))                  # starts from 1990
    for j in January February March April May July June August September October November December; do
        mlfile="${i}-${j}.txt"
        if [ ! -e "${mlfile}" ]; then
            continue
        fi
        s="${s} ${mlfile}"
        echo "<div><a href='../mlv.html?./tuhs/${mlfile}'>${mlfile}</a></div>" >> "${index_file}"
    done

    mlfile_wholeyear="${i}.txt"
    if [ -e "${mlfile_wholeyear}" ]; then
        echo "<div><a href='../mlv.html?./tuhs/${mlfile_wholeyear}'>${mlfile_wholeyear}</a></div>" >> "${index_file}"
        echo '<br/>' >> "${index_file}"
    fi

done

mlfileall=all.txt
if [ ${has_new_mlfile} -eq 1 ] || [ ! -e ${mlfileall} ]; then
    cat ${s} > ${mlfileall}
fi
echo "<div><a href='../mlv.html?./tuhs/${mlfileall}'>${mlfileall}</a></div>" >> "${index_file}"

echo '</body></html>' >> "${index_file}"

open -a Firefox.app "${index_file}"
