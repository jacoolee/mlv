const MSG_SEPARATOR_REGEXP = /^From [^ ]* at [^ ]* *[A-z]{3} [A-z]{3} [ 0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{4}/

let gLines = [ /* line, ... */ ]
let gMsgIds = [ /* MessageId, ... */ ] // ordered by time
let gMsgMap = { /* MessageId: block */ }
let gReplyMap = { /* msgId: [msgId, ...] */ }
let gIsReplyMap = { /* msgId: true/false */} // msgId is a reply or not
let gRenderedMap = { /* msgId: true/false */} // whether rendered or not
let gMsgIdsRendered = [ /* msgId, ... */ ]
let gCurHiParentMsgId = null
let gCurHiMsgId = null

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
            block.startIdx = idx
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
                block['fromShort'] = m&&m.length? m[0]: ''
                break
            }
            case 'Date': {
                block['date'] = v
                break
            }
            case 'Subject': {
                block['subject'] = v
                break
            }
            case 'Message-ID': {
                if (v in block) {
                    console.warn('mlv: Message-ID already used', l)
                }

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
                    console.warn('mlv: unsupported pk:', pk, v, idx)
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

        if (block.hasOwnProperty('inReplyTo')) {
            const x = block['inReplyTo'].match(/<[^>]*>/)
            if (x) {
                block['inReplyToMailAddress'] = x[0]
            } else {
                console.warn(
                    'mlv: inReplyToMailAddress not found in',
                    'block.inReplyTo:', block.inReplyTo,
                    'block:', block
                )
            }
        }

        // now, ignore header/body separator and go on
        l = gLines[++idx]
        block.bodyStartIdx = idx
        while (!l.match(MSG_SEPARATOR_REGEXP)) {
            l = gLines[++idx]
            if (l === undefined) { // end
                break
            }
        }
        block.bodyEndIdx = idx-2

        gMsgIds.push(block.messageId)
        gMsgMap[block.messageId] = block

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

    const parentMsgId = block.inReplyTo
    let e = null

    if (parentMsgId) {
        if (gCurHiParentMsgId) {
            e = document.getElementById(gCurHiParentMsgId)
            if (e) e.setAttribute('style','')
        }
        e = document.getElementById(parentMsgId)
        if (e) e.setAttribute('style', 'background-color: goldenrod;')
        gCurHiParentMsgId = parentMsgId
    } else {
        if (gCurHiParentMsgId) {
            e = document.getElementById(gCurHiParentMsgId)
            if (e) e.setAttribute('style','')
        }
    }

    if (gCurHiMsgId) {
        if (gCurHiMsgId !== gCurHiParentMsgId) {
            e = document.getElementById(gCurHiMsgId)
            if (e) e.setAttribute('style','')
        }
    }

    e = document.getElementById(msgId)
    e.setAttribute('style', 'background-color: lightgreen;')
    if (!isVisibleInContainer(e, document.getElementById('mailhead'))) {
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

function renderMsgTreeItem(msgId, level=0, marker='') {
    gMsgIdsRendered.push(msgId)
    const currMsgIdxRendered = gMsgIdsRendered.length-1

    const block = gMsgMap[msgId]
    const {from, fromShort, subject, date, } = block

    let div = document.createElement('div')
    div.setAttribute('class', 'msgtree-item')
    div.setAttribute('id', msgId)
    div.setAttribute('idx', currMsgIdxRendered)

    let span1 = document.createElement('span')
    const span1Text = `${marker? marker:' '}${' '.repeat(level)}${level>0?'↳':''}`
    span1.innerText = span1Text
    span1.setAttribute('class', 'msgtree-item--left')
    div.appendChild(span1)

    let span2 = document.createElement('span')
    const span2Text = `${subject} <${date}> ${fromShort||from} ${msgId} <${currMsgIdxRendered+1}/${gMsgIds.length}>`
    span2.innerText = span2Text
    span2.setAttribute('class', 'msgtree-item--right')
    div.appendChild(span2)

    // console.log(span1Text+span2Text)

    div.onclick = function() {
        showMsg(msgId)
    }
    document.getElementById('mailhead').appendChild(div)
}

function renderMsgBody(msgId) {
    const block = gMsgMap[msgId]
    const {messageId, from, fromShort, subject, date, inReplyTo, bodyStartIdx, bodyEndIdx} = block
    const parentMsgId = gMsgMap[msgId].inReplyTo || '<None>'
    const parentBlock = gMsgMap[parentMsgId]

    const mailbodyHeaderElm = document.getElementById('mailbody-header')
    mailbodyHeaderElm.innerText = `\
Subject   : ${subject}\n\
From      : ${fromShort?fromShort.substring(1,fromShort.length-1):from}\n\
Reply To  : ${parentBlock? (parentBlock.fromShort?parentBlock.fromShort.substring(1,parentBlock.fromShort.length-1): parentBlock.from): '<None>'}\n\
Date      : ${date}\n\
Parent Id : ${parentMsgId}\n\
MessageId : ${messageId}`

    let body = ''
    for (var i=bodyStartIdx; i<=bodyEndIdx;i++) {
        body += gLines[i]+'\n'
    }

    const mailbodyBodyElm = document.getElementById('mailbody-body')
    mailbodyBodyElm.innerText = body
}

function _renderReplyRecursively(msgId, level=1) {
    (gReplyMap[msgId] || []).forEach((i,idx) => {
        if (!gRenderedMap[i]) {
            renderMsgTreeItem(i, level)
            gRenderedMap[i] = true
        }
        _renderReplyRecursively(i, level+1)
    })
}

function render() {
    for(var i of gMsgIds) {
        // if msg is not a reply, render it,
        // else it will be rendered in reply chain
        if (!gIsReplyMap[i]) {
            if (!gRenderedMap[i]) {
                renderMsgTreeItem(i, 0, '-')
                gRenderedMap[i] = true
            }
        } else {
            const replyTo = gMsgMap[i]['inReplyTo']
            if (!(replyTo in gMsgMap)) {
                if (!gRenderedMap[i]) {
                    renderMsgTreeItem(i, 0, '*')
                    gRenderedMap[i] = true
                }
            }
        }
        _renderReplyRecursively(i)
    }
}

function check() {
    console.log(
        'mlv:',
        'gMsgIdsRendered:', gMsgIdsRendered.length,
        'gMsgIds.length:', gMsgIds.length,
        'missing:', gMsgIds.length-gMsgIdsRendered.length
    )
}

function hotkeys() {
    document.addEventListener('keydown', (e) => {
        const {key, keyCode} = e
        switch(key) {
        case 'j': {
            e = document.getElementById(gCurHiMsgId)
            if (!e) return
            const idx = Number(e.getAttribute('idx'))
            const nextMsgId = gMsgIdsRendered[idx+1]
            showMsg(nextMsgId)
            break
        }
        case 'k': {
            e = document.getElementById(gCurHiMsgId)
            if (!e) return
            const idx = Number(e.getAttribute('idx'))
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
        }
    })
}

function main() {
    const qmidx = window.location.href.indexOf('?')
    const filePath = window.location.href.substring(qmidx+1)
    loadTextFile(filePath, (text) => {
        parse(text, 'From tuhs at tuhs.org')
        render()
        if (gMsgIdsRendered.length) {
            showMsg(gMsgIdsRendered[0])
        }
        check()
        hotkeys()
    })
}

// ################################################################
main()
