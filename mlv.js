const MSG_SEPARATOR_REGEXP = /^From [^ ]*( at [^ ]*)? *[A-z]{3} [A-z]{3} [ 0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{4}/
const MSGTREE_ITEM_HEIGHT = 17 /* 17: total height of a msgtree-item, keep same as that in css */
const UNAME_LEN = 14

let gTime = Date.now()
let gLines = [ /* line, ... */ ]
let gMsgIds = [ /* MessageId, ... */ ] // ordered by time
let gMsgMap = { /* MessageId: block */ }
let gMsgSameMap = { /*MessageId: [ lidx, ... ]*/ }
let gReplyMap = { /* msgId: [msgId, ...] */ }
let gIsReplyMap = { /* msgId: true/false */} // msgId is a reply or not
let gRenderedMap = { /* msgId: true/false */} // whether rendered or not
let gMsgIdsRendered = [ /* msgId, ... */ ]
let gMsgIdsLevel0 = [ /* msgId, ... */ ]
let gCurHiParentMsgId = null
let gCurHiMsgId = null

function fls(text, length, paddingChar=' ', paddingAtHead=false) {    // fixed length string
    if (text.length > length) return text.substring(0,length)
    if (text.length === length) return text
    const padding = paddingChar.repeat(length-text.length)
    if (paddingAtHead) {
        return padding + text
    } else {
        return text + padding
    }
}

function loadTextFile(filePath, onLoaded=(text)=>{}) {
    fetch(filePath).then((response) => {
        response.text().then(onLoaded)
    })
}

function parse(text='') {
    gLines = text.split('\n')
    var idx = 0, l = null, block = {}, blockIdx = 0

    while(idx<gLines.length) {
        l = gLines[idx]

        if (l.match(MSG_SEPARATOR_REGEXP)) {
            block.blockIdx = ++blockIdx
            block.separator = l
            block.beginLidx = idx
        } else {
            console.warn('mlv: not match', idx, l)
        }

        let pk = null
        while ((l = gLines[++idx]) !== '') {
            let cidx = 0, k = null, v = null

            const commanIdx = l.indexOf(':')
            k = l.substring(0, commanIdx)
            v = l.substring(commanIdx+2)

            switch(k) {
            case 'From': {
                block['from'] = v
                let m = v.match(/\(.* via TUHS\)/)
                block['fromShort'] = m
                    ? m[0].match(/[A-z0-9]+ ?([A-z0-9]*)?/)[0].replace(' via','')
                    : v.replace(/ at .*/, '')
                break
            }
            case 'Date': {
                block['date'] = v
                let x = v.match(/[0-9]{1,2} [A-z]{3} [0-9]{2,4} *[0-9]{1,2}:[0-9]{1,2}(:[0-9]{1,2})?/)
                if (x) {
                    let day = v.match(/[0-9]{1,2}/)[0]
                    let _x = v.match(/[A-z]{3} [0-9]{2,4}/)[0]
                    let mon = _x.match(/[A-z]{3}/)[0]
                    let year = _x.match(/[0-9]{2,4}/)[0]
                    block['day'] = day? (String(day).length<2 ?'0'+day: day): ''
                    block['mon'] = mon || ''
                    block['year'] = year? year<100?'  '+year: (year <1000? ' '+year: year): ''
                }
                block['dateShort'] = x? x[0]: v
                if (!x) {
                    console.debug('mlv: date v:', v)
                }
                break
            }
            case 'Subject': {
                block['subject'] = v
                break
            }
            case 'Message-ID': {
                block['messageId'] = v
                break
            }
            case 'In-Reply-To': {
                block['inReplyTo'] = v
                break
            }

            case 'References': {
                // block['references'] = [v] // useless for mlv
                break
            }

            default: {
                switch (pk) {
                case 'Subject': {
                    block['subject'] = block['subject']+v
                    break
                }
                case 'In-Reply-To': {
                    block['inReplyTo'] = block['inReplyTo']+v
                    break
                }

                case 'References': {
                    // block['references'].push(v) // useless for mlv
                    break
                }

                default: {
                    console.debug('mlv: unsupported pk:', pk, v, idx)
                    break
                }
                }
                break
            }
            }

            if (k){
                pk = k
            }
        }

        // Always ensure messageId exists
        if (!block.hasOwnProperty('messageId')) {
            block.messageId = `<#${idx}>`
        }

        if (block.hasOwnProperty('inReplyTo')) {
            const x = block.inReplyTo.match(/<[^>]*>/)
            if (x) {
                block.inReplyToMailAddress = x[0]
            } else {
                console.debug(
                    'mlv: inReplyToMailAddress not found in',
                    'block.inReplyTo:', block.inReplyTo,
                    'block:', block
                )
            }
        }

        // now, ignore header/body separator and go on
        l = gLines[++idx]
        block.bodyBeginLidx = idx
        while (!l.match(MSG_SEPARATOR_REGEXP)) {
            l = gLines[++idx]
            if (l === undefined) { // end
                break
            }
        }
        block.bodyEndLidx = idx-2

        // process message bloch which has same message Id
        if (block.messageId in gMsgMap) {
            console.debug('mlv: Message-ID same occurs', block.beginLidx, gLines[block.beginLidx])
            const id = block.messageId

            if (!(id in gMsgSameMap)) {
                gMsgSameMap[id] = [gMsgMap[id].beginLidx]
            }
            gMsgSameMap[id].push(block.beginLidx)

            const mmid = block.messageId + '$' + (gMsgSameMap[id][gMsgSameMap[id].length-1]+1)
            block.messageIdModified = mmid
        }

        if (block.messageIdModified) {
            gMsgMap[block.messageIdModified] = block
            gMsgIds.push(block.messageIdModified)
        } else {
            gMsgMap[block.messageId] = block
            gMsgIds.push(block.messageId)
        }

        // self-made reply chain, same effect as references
        if (block.hasOwnProperty('inReplyToMailAddress')) {
            if (gReplyMap.hasOwnProperty(block.inReplyToMailAddress)) {
                gReplyMap[block.inReplyToMailAddress].push(block.messageId)
            } else {
                gReplyMap[block.inReplyToMailAddress] = [block.messageId]
            }
        }

        gIsReplyMap[block.messageId] = block.hasOwnProperty('inReplyTo')? true: false

        block = {}
    }
}

function showMsg(msgId) {
    const block = gMsgMap[msgId]
    if (!block) return

    let e = null

    // clear old
    const parentMsgId = block.inReplyToMailAddress || block.inReplyTo
    if (parentMsgId === gCurHiParentMsgId) {
        // do nothing, no need to clear
    } else {
        e = document.getElementById(gCurHiParentMsgId)
        if (e) {
            e.classList.remove('hi--parent')
            gReplyMap[gCurHiParentMsgId].forEach((id) => {
                document.getElementById(id).classList.remove('hi--sibling')
            })
        }
    }

    // set new
    if (parentMsgId) {
        e = document.getElementById(parentMsgId)
        if (e) {
            e.classList.add('hi--parent')
            gReplyMap[parentMsgId].forEach((id) => {
                document.getElementById(id).classList.add('hi--sibling')
            })
            gCurHiParentMsgId = parentMsgId
        } else {
            gCurHiParentMsgId = null
        }
    }

    // clear old
    if (gCurHiMsgId) {
        document.getElementById(gCurHiMsgId).classList.remove('hi--cur')
    }

    // set new
    e = document.getElementById(msgId)
    e.classList.add('hi--cur')
    if (!isVisibleInContainer(e, document.getElementById('msgtree'))) {
        e.scrollIntoView()
    }
    gCurHiMsgId = msgId

    renderMsgBody(msgId)
}

function isVisibleInContainer(el, container) {
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    return elRect.top < containerRect.bottom - 30
        && elRect.bottom > containerRect.top + 30
}

function renderMsgTreeItem(msgId, level=0, isLastSibling=false, siblingBarIdxs=[], marker='') {
    // NOTE: using @msgId in whole process, do not use block.messageId
    if (level === 0) {
        gMsgIdsLevel0.push(msgId)
    }

    gMsgIdsRendered.push(msgId)
    gRenderedMap[msgId] = true
    const currMsgIdxRendered = gMsgIdsRendered.length-1

    const block = gMsgMap[msgId]
    if (!block) {
        console.error('mlv: no block found by msgId:', msgId)
        return
    }

    const {from, fromShort, subject, inReplyTo, inReplyToMailAddress, date, day, mon, year, dateShort, beginLidx, bodyEndLidx} = block
    block.level = level
    if (level === 0) {
        block.level0Idx = gMsgIdsLevel0.length-1
    }

    let div = document.createElement('div')
    div.setAttribute('class', 'msgtree-item')
    div.setAttribute('id', msgId)
    div.setAttribute('ridx', currMsgIdxRendered)

    let span1 = document.createElement('span')
    let s = '', sl = []

    const isRoot = level === 0
    const replies = gReplyMap[msgId]
    const hasChildren = !!replies

    if (isRoot) {               // tree root/thread head
        if (hasChildren) {
            s = '┬'
        } else {
            s = '─'
        }
    } else {                    // branch/reply
        if (hasChildren) {
            if (level === 1) {
                if (isLastSibling) {
                    s = '╰┬'
                } else {
                    s = '├┬'
                }
            } else {
                if (isLastSibling) {
                    sl = `${' '.repeat(level-1)}╰┬`.split('')
                    siblingBarIdxs.forEach((item, idx) => {
                        sl[item] = idx===siblingBarIdxs.length-1? (item===level-1?'╰':'│'): '│'
                    })
                    s = sl.join('')
                } else {
                    sl = `${' '.repeat(level-1)}├┬`.split('')
                    siblingBarIdxs.forEach((item, idx) => {
                        sl[item] = idx===siblingBarIdxs.length-1? '├': '│'
                    })
                    s = sl.join('')
                }
            }
        } else {
            if (level === 1) {
                if (isLastSibling) {
                    s = '╰─'
                } else {
                    s = '├─'
                }
            } else {
                if (isLastSibling) {
                    sl = `${' '.repeat(level-1)}╰─`.split('')
                    siblingBarIdxs.forEach((item, idx) => {
                        sl[item] = idx===siblingBarIdxs.length-1? (item===level-1?'╰':'│'): '│'
                    })
                    s = sl.join('')
                } else {
                    sl = `${' '.repeat(level-1)}├─`.split('')
                    siblingBarIdxs.forEach((item, idx) => {
                        sl[item] = idx===siblingBarIdxs.length-1? '├': '│'
                    })
                    s = sl.join('')
                }
            }
        }
    }

    const poster = fls(fromShort||from||'', UNAME_LEN)
    const _year = fls(year? (Number(year) < 2026? year: ''): '', 4, ' ', true)
    const time = `${_year} ${mon||''} ${day||''}`

    const parentMsgId = inReplyToMailAddress || inReplyTo || '<None>'
    const parentBlock = gMsgMap[parentMsgId]
    const _subject = parentBlock? (parentBlock.subject == subject? '...': subject): subject

    s = `${marker||' '} ${time}  ${poster}  ${s}► ${_subject}`

    div.innerText = fls(s, 100)+ `  ${currMsgIdxRendered+1}/${gMsgIds.length}`
    div.onclick = function() { showMsg(msgId) }
    document.getElementById('msgtree').appendChild(div)
}

function renderMsgBody(msgId) {
    const block = gMsgMap[msgId]
    const {messageIdModified, messageId, from, fromShort, subject, date, inReplyToMailAddress, inReplyTo, beginLidx, bodyBeginLidx, bodyEndLidx} = block
    const parentMsgId = inReplyToMailAddress || inReplyTo || '<None>'
    const parentBlock = gMsgMap[parentMsgId]

    const replyTo = parentBlock
          ? (parentBlock.fromShort||parentBlock.from)
          : (inReplyTo || '<None>')

    let e = document.getElementById('mailbody-header')
    e.innerText = `\
Subject   : ${subject}\n\
From      : ${fromShort||from}\n\
Reply To  : ${replyTo}\n\
Date      : ${date}\n\
Parent Id : ${parentMsgId}\n\
MessageId : ${messageIdModified||messageId}`

    let t = ''
    for (var i=beginLidx; i<bodyBeginLidx-1;i++) {
        t += gLines[i]+'\n'
    }
    e = document.getElementById('mailbody-header-raw')
    e.innerText = t

    t = ''
    for (var i=bodyBeginLidx; i<=bodyEndLidx;i++) {
        t += gLines[i]+'\n'
    }
    e = document.getElementById('mailbody-body--content')
    e.innerText = t
}

function _renderReplyRecursively(msgId, level=1, siblingBarIdxs=[]) {
    const replies = (gReplyMap[msgId] || [])
    const hasMultipleChildren = replies.length > 1
    replies.forEach((i,idx) => {
        let ss = [...siblingBarIdxs].concat([level])
        let isLastSibling = idx === replies.length-1
        if (isLastSibling) {
            ss.pop()
        }
        if (!gRenderedMap[i]) {
            renderMsgTreeItem(i, level+1, idx===replies.length-1, ss, '')
        }
        _renderReplyRecursively(i, level+1, ss)
    })
}

function render() {
    for(var i of gMsgIds) {
        let siblingBarIdxs = []
        if (!gRenderedMap[i]) {
            renderMsgTreeItem(i, 0, false, siblingBarIdxs, gIsReplyMap[i]? '<': '*')
        }
        _renderReplyRecursively(i, 0, siblingBarIdxs)

        // render messages with same message-id
        if (i in gMsgSameMap) {
            for (var j=1; j<gMsgSameMap[i].length; j++) {
                const mmid = i + '$' + String(gMsgSameMap[i][j]+1)
                if (!gRenderedMap[mmid]) {
                    renderMsgTreeItem(mmid, 0, false, siblingBarIdxs, '$')
                }
            }
        }
    }
}

function check() {
    const gMsgSameMapKeysCount = Object.keys(gMsgSameMap).length
    const gMsgSameMapValuesCount = Object.keys(gMsgSameMap).reduce((res, k, idx) => {
        res += gMsgSameMap[k].length
        return res
    }, 0)
    console.log(
        'timecost:', (Date.now() - gTime)+'ms',
        '\ngMsgIds:', gMsgIds.length,
        '\ngMsgIdsRendered:', gMsgIdsRendered.length,
        '\ngRenderedMap keys count:', Object.keys(gRenderedMap).length,
        '\ngMsgMap keys count:', Object.keys(gMsgMap).length,
        '\ngMsgSameMap keys count:', gMsgSameMapKeysCount,
        '\ngMsgSameMap values count:', gMsgSameMapValuesCount,
        '\nDuplicated message count:', gMsgSameMapValuesCount - gMsgSameMapKeysCount,
        '\nNot rendered:', gMsgIds.length - gMsgIdsRendered.length,
    )
}

function hotkeys() {
    document.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
            return
        }

        const {key, keyCode} = e
        switch(key) {
        case 'j': {
            e = document.getElementById(gCurHiMsgId)
            if (!e) return
            const idx = Number(e.getAttribute('ridx'))
            const nextMsgId = gMsgIdsRendered[idx+1]
            showMsg(nextMsgId)
            break
        }
        case 'k': {
            e = document.getElementById(gCurHiMsgId)
            if (!e) return
            const idx = Number(e.getAttribute('ridx'))
            const prevMsgId = gMsgIdsRendered[idx-1]
            showMsg(prevMsgId)
            break
        }
        case 'p': {
            if (!gCurHiParentMsgId) return
            showMsg(gCurHiParentMsgId)
            break
        }
        case 'n': {
            if (!gCurHiMsgId) return
            const replies = gReplyMap[gCurHiMsgId]
            if (!replies || replies.length === 0) return
            showMsg(replies[0])
            break
        }

        case 'l': {             // same level, prev message in message chain
            if (!gCurHiMsgId) return
            const {level0Idx, level} = gMsgMap[gCurHiMsgId]
            if (level === 0) {
                if (level0Idx === 0) return
                showMsg(gMsgIdsLevel0[level0Idx-1])
            } else {
                const replies = gReplyMap[gCurHiParentMsgId]
                const idx = replies.indexOf(gCurHiMsgId)
                if (idx === 0) return
                showMsg(replies[idx-1])
            }
            break
        }

        case 'h': {             // same level, prev message in message chain
            if (!gCurHiMsgId) return
            const {level0Idx, level} = gMsgMap[gCurHiMsgId]
            if (level === 0) {
                if (level0Idx === gMsgIdsLevel0.length-1) return
                showMsg(gMsgIdsLevel0[level0Idx+1])
            } else {
                const replies = gReplyMap[gCurHiParentMsgId]
                const idx = replies.indexOf(gCurHiMsgId)
                if (idx === replies.length-1) return
                showMsg(replies[idx+1])
            }
            break
        }

        case 'r': {
            e = document.getElementById('mailbody-header-raw')
            let s = e.getAttribute('style')
            if (s && s.includes('block')) {
                e.setAttribute('style', 'display: none;')
            } else {
                e.setAttribute('style', 'display: block;')
            }
            break
        }

        case 'm': {
            document.getElementById('m').click()
            break
        }

        case '=': {
            e = document.getElementById('msgtree')
            let e2 = document.getElementById('mailbody')
            if (e.classList.contains('msgtree--v')) {
                e.classList.remove('msgtree--v')
                e2.classList.remove('mailbody--v')
                localStorage.setItem('v', 0)
            } else {
                e.classList.add('msgtree--v')
                e2.classList.add('mailbody--v')
                localStorage.setItem('v', 1)
            }
            break
        }

        case '0': {
            showMsg(gMsgIdsRendered[0])
            break
        }

        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8': {
            const idx = parseInt(gMsgIdsRendered.length * Number(key) / 10)
            const msgId = gMsgIdsRendered[idx]
            showMsg(msgId)
            break
        }

        case '9': {
            showMsg(gMsgIdsRendered[gMsgIdsRendered.length-1])
            break
        }

        case 'b': {
            e = document.getElementById('msgtree')
            e.scrollBy({
                top: -(e.clientHeight-20),
                behavior: 'smooth'
            })
            break
        }

        case 'c': {
            const x = document.getElementsByTagName('html')[0].classList
            if (x.contains('light')) {
                x.remove('light')
                x.add('dark')
            } else {
                x.remove('dark')
                x.add('light')
            }
            break
        }

        case 'Enter':
        case 'v': {
            e = document.getElementById('msgtree')
            e.scrollBy({
                top: (e.clientHeight-20),
                behavior: 'smooth'
            })
            break
        }

        case ',': {
            e = document.getElementById(gCurHiMsgId)
            e.scrollIntoView()
            e = document.getElementById('msgtree')
            e.scrollBy({
                top: -e.clientHeight/2,
                behavior: 'smooth', // or 'auto'
            })
            break
        }

        case '.': {      // view message located at top of thread view
            e = document.getElementById('msgtree')
            let h = e.scrollTop - 10 /*first child's margin top*/
            if (h < 0) h = 0
            let idx = Math.ceil(h / MSGTREE_ITEM_HEIGHT)
            if (idx > gMsgIdsRendered.length-1) {
                idx = gMsgIdsRendered.length-1
            }
            showMsg(gMsgIdsRendered[idx])
            break
        }

        case ';': {   // view message located at center of thread view
            e = document.getElementById('msgtree')
            let h = e.scrollTop + e.clientHeight/2
            if (h < 0) h = 0
            let idx = Math.ceil(h / MSGTREE_ITEM_HEIGHT)
            if (idx > gMsgIdsRendered.length-1) {
                idx = gMsgIdsRendered.length-1
            }
            showMsg(gMsgIdsRendered[idx])
            break
        }

        case ' ': {
            e = document.getElementById('mailbody')
            e.focus()
            e.scrollBy({
                top: (e.clientHeight-20),
                behavior: 'smooth'
            })
            break
        }

        case 'i': {
            document.getElementById('i').click()
            break
        }

        case 'Backspace':
        case 'o':
        case 'u': {
            e = document.getElementById('mailbody')
            e.focus()
            e.scrollBy({
                top: -(e.clientHeight-20),
                behavior: 'smooth'
            })
            break
        }

        default: {
            console.debug('mlv: unsupported key:', key, keyCode)
            break
        }
        }
    })
}

function preinit() {
    const theme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    const html = document.getElementsByTagName('html')[0]
    html.classList.add(theme)
}

function init() {
    const v = localStorage.getItem('v')
    if (!v) return
    let e = document.getElementById('msgtree')
    let e2 = document.getElementById('mailbody')
    if (v==='1') {
        e.classList.add('msgtree--v')
        e2.classList.add('mailbody--v')
    }
}

function main() {
    preinit()

    const qmidx = window.location.href.indexOf('?')
    const filePath = window.location.href.substring(qmidx+1)
    loadTextFile(filePath, (text) => {
        init()
        parse(text)
        render()
        if (gMsgIdsRendered.length) {
            showMsg(gMsgIdsRendered[0])
        }
        hotkeys()
        check()
    })
}

main()
