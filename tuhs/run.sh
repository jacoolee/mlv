#!/usr/bin/env bash
# set -x

wget 'https://www.tuhs.org/Archive/Documentation/TUHS/Mail_list/' -O /tmp/tuhsml.html

mlfile_latest_last=$(head -1 mlfile_latest.txt 2>/dev/null)
if [ "${mlfile_latest_last}" != '' ]; then
    echo "clear ${mlfile_latest_last} ..."
    rm -f "${mlfile_latest_last}" "${mlfile_latest_last}.gz" &>/dev/null
fi

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
mlfile_latest=''
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
        mlfile_latest="${mlfile}"
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

echo "${mlfile_latest}" > mlfile_latest.txt

# generate index.html, always overwrite
index_file=index.html

echo '<html style="font-family: menlo, courier, monospace; font-size: 13;"><body>' > "${index_file}"

# all.txt
mlfileall=all.txt
if [ ${has_new_mlfile} -eq 1 ] || [ ! -e ${mlfileall} ]; then
    cat ${s} > ${mlfileall}
fi
echo "<div><a href='../mlv.html?./tuhs/${mlfileall}'>[${mlfileall}]</a></div><br/>" >> "${index_file}"

# .txt by year
i=$((curyear+1))
s=''
while [ $i -gt 1989 ]; do
    i=$((i-1))                  # starts from 1990
    for j in January February March April May July June August September October November December; do
        mlfile="${i}-${j}.txt"
        if [ ! -e "${mlfile}" ]; then
            continue
        fi
        s="${s} ${mlfile}"
        echo "<span><a href='../mlv.html?./tuhs/${mlfile}'>${mlfile}</a> </span>" >> "${index_file}"
    done

    mlfile_wholeyear="${i}.txt"
    if [ -e "${mlfile_wholeyear}" ]; then
        echo "<div><a href='../mlv.html?./tuhs/${mlfile_wholeyear}'>[${mlfile_wholeyear}]</a></div>" >> "${index_file}"
        echo '<br/>' >> "${index_file}"
    fi

done

echo '</body></html>' >> "${index_file}"

open -a Firefox.app "${index_file}"
