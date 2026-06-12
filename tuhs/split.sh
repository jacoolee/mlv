#!/usr/bin/env bash
# set -x

split() {
    mlfile="${1}"
    mlfilename=$(basename "${mlfile}")
    mlfile_ln_file=/tmp/${mlfilename}.ln.txt

    mkdir split.sh.output 2>/dev/null

    grep -n '^From .*[0-9][0-9]:[0-9][0-9] [0-9][0-9][0-9][0-9]$' ${mlfile} | cut -d ':' -f1 > ${mlfile_ln_file}

    li=2                        # ignore email message separator
    for i in $(sed -n '2,$p' ${mlfile_ln_file}); do
        range="${li},$((i-2))"
        sed -n "${range}p" ${mlfile} > "split.sh.output/${mlfilename}.${range}.txt"
        li=$((i+1))             # ignore email message separator
    done

    # last one
    range="${li},$"
    sed -n "${range}p" ${mlfile} > "split.sh.output/${mlfilename}.${range}.txt"
}

for i in [0-9]*-[A-z]*.txt; do
    echo $i
    split $i
done
