#!/usr/bin/env bash
# set -x

if [ ${ENV_RUN_DRY:-0} -eq 1 ]; then
    :
else
    wget 'https://www.tuhs.org/Archive/Documentation/TUHS/Mail_list/' -O /tmp/tuhsml.html

    mlfile_latest_last=$(head -1 mlfile_latest.txt 2>/dev/null)
    if [ "${mlfile_latest_last}" != '' ]; then
        echo "clear ${mlfile_latest_last} ..."
        rm -f "${mlfile_latest_last}" "${mlfile_latest_last}.gz" &>/dev/null
    fi
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
ss=''
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

    ss="${ss} ${s}"

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

echo '<html style="white-space: nowrap;"><style>.y {border-bottom: solid 1px gray; width: 750px; } a {text-decoration: unset;}</style><body>' > "${index_file}"

# all.txt
mlfileall=all.txt
if [ ${has_new_mlfile} -eq 1 ] || [ ! -e ${mlfileall} ]; then
    cat ${ss} > ${mlfileall}
fi
echo "<div><a href='../mlv.html?./tuhs/${mlfileall}'>[${mlfileall}]</a></div><br/>" >> "${index_file}"

# .txt by year
i=$((curyear+1))
while [ $i -gt 1990 ]; do
    i=$((i-1))
    mlfile_wholeyear="${i}.txt"

    if [ -e "${mlfile_wholeyear}" ]; then
        echo '<div class="y">' >> "${index_file}"
        echo "<span><a href='../mlv.html?./tuhs/${mlfile_wholeyear}'>[${mlfile_wholeyear}]</a> </span>" >> "${index_file}"
    else
        continue
    fi

    for j in January February March April May July June August September October November December; do
        mlfile="${i}-${j}.txt"
        if [ ! -e "${mlfile}" ]; then
            echo "<span title='${mlfile}'><a style='color: white;' href='../mlv.html?./tuhs/${mlfile}'>${j}</a> </span>" >> "${index_file}"
        else
            echo "<span title='${mlfile}'><a style='' href='../mlv.html?./tuhs/${mlfile}'>${j}</a></span>" >> "${index_file}"
        fi
    done
    echo '</div>' >> "${index_file}"

done

echo '</body></html>' >> "${index_file}"

open -a Firefox.app "${index_file}"
