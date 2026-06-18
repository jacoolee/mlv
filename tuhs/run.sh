#!/usr/bin/env bash
# set -x

script_file=${BASH_SOURCE[0]}
script_name=$(basename "${script_file}")
script_root=$(cd $(dirname "${script_file}") && pwd)

# ensure run under script_root
echo '################################################################'
date
cd "${script_root}"

if [ ${ENV_RUN_DRY:-0} -eq 1 ]; then
    :
else
    /opt/homebrew/bin/wget 'https://www.tuhs.org/Archive/Documentation/TUHS/Mail_list/' -O /tmp/tuhsml.html.tmp

    if [ -e /tmp/tuhsml.html.tmp ]; then
        mv /tmp/tuhsml.html.tmp /tmp/tuhsml.html
    fi

    mlfile_latest_last=$(head -1 "${script_root}"/mlfile_latest.txt 2>/dev/null)
    if [ -e "${mlfile_latest_last}" ]; then
        echo "clear ${mlfile_latest_last} ..."
        rm -f "${mlfile_latest_last}" "${mlfile_latest_last}.gz" &>/dev/null
    fi
fi

has_new_mlfile=0
for l in $(grep -o 'href="[^"]*txt[\.gz]*' /tmp/tuhsml.html | cut -c7-); do
    mlfilename=$(basename "${l}")
    mlfile="${script_root}"/"${mlfilename}"
    if [ -e "${mlfile}" ]; then
        continue
    fi
    url="https://www.tuhs.org/Archive/Documentation/TUHS/Mail_list/${l}"
    /opt/homebrew/bin/wget "${url}" -O "${mlfile}.tmp"
    if [ -e "${mlfile}.tmp" ] && [[ $(file "${mlfile}.tmp") != *"empty"* ]]; then
        has_new_mlfile=1
        mv "${mlfile}.tmp" "${mlfile}"
    fi
done

# extract gz file
for gzfile in "${script_root}"/*.gz; do
    txtfile=${gzfile//.gz/}
    if [ -e "${txtfile}" ]; then
        continue
    fi
    gzip -fdk "${gzfile}" > "${txtfile}"
done

# generate whole year maillist ordered by time
mlfile_latest=''
curyear=$(date '+%Y')
year=1989
ss=''
while [ $year -lt ${curyear} ]; do
    year=$((year+1))                  # starts from 1990

    s=''
    for mon in January February March April May June July August September October November December; do
        mlfile="${script_root}"/"${year}-${mon}.txt"
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

    mlfile_wholeyear="${script_root}"/"${year}.txt"
    if [ ${year} -eq ${curyear} ] || [ ! -e "${mlfile_wholeyear}" ]; then
        cat ${s} > "${mlfile_wholeyear}"
    fi
done

echo "${mlfile_latest}" > mlfile_latest.txt

# generate index.html, always overwrite
index_file="${script_root}"/index.html

echo '<html style="white-space: nowrap; font-family: menlo; font-size: 13;"><style>.y {width: 755px; } a {text-decoration: unset;}</style><body>' > "${index_file}"

# all.txt
mlfilenameall=all.txt
mlfileall="${script_root}"/"${mlfilenameall}"
if [ ${has_new_mlfile} -eq 1 ] || [ ! -e ${mlfileall} ]; then
    cat ${ss} > ${mlfileall}
fi
echo "<div><a href='../mlv.html?./tuhs/${mlfilenameall}'>[${mlfilenameall}]</a></div><br/>" >> "${index_file}"

# .txt by year
year=$((curyear+1))
while [ $year -gt 1990 ]; do
    year=$((year-1))

    mlfilename_wholeyear="${year}.txt"
    mlfile_wholeyear="${script_root}"/"${mlfilename_wholeyear}"

    if [ -e "${mlfile_wholeyear}" ]; then
        echo '<div class="y">' >> "${index_file}"
        echo "<span><a href='../mlv.html?./tuhs/${mlfilename_wholeyear}'>[${mlfilename_wholeyear}]</a> </span>" >> "${index_file}"
    else
        continue
    fi

    for mon in January February March April May June July August September October November December; do
        mlfilename="${year}-${mon}.txt"
        mlfile="${script_root}"/"${mlfilename}"
        if [ ! -e "${mlfile}" ]; then
            echo "<span title='${mlfilename}'><a style='color: transparent;' href='../mlv.html?./tuhs/${mlfilename}'>${mon}</a> </span>" >> "${index_file}"
        else
            echo "<span title='${mlfilename}'><a style='' href='../mlv.html?./tuhs/${mlfilename}'>${mon}</a></span>" >> "${index_file}"
        fi
    done
    echo '</div>' >> "${index_file}"

done

echo '</body></html>' >> "${index_file}"

open -a Firefox.app "${index_file}"

# if [ ${ENV_RUN_DRY:-0} -eq 1 ]; then
#     :
# else
#     cd "${script_root}"/
#     git add .
#     git commit -am "auto stored by run.sh"
#     git push
#     cd -
# fi
