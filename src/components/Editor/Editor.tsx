import React, { useState, useEffect, useRef, useCallback } from 'react'
import MonacoEditor from 'react-monaco-editor'
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api'

/* eslint import/no-webpack-loader-syntax: off */
// @ts-ignore
import editorTypes from '!!raw-loader!./editorTypes.d.ts'
/* eslint import/no-webpack-loader-syntax: off */
// @ts-ignore
import defaultScript from '!!raw-loader!./defaultScript.js'
import { typeContractMethods } from 'libs/contract'
import { getWeb3Instance } from 'libs/web3'
import { isIOS } from 'libs/device'

import { Props } from './types'
import { saveLastUsedCode, getLastUsedCode } from 'libs/localstorage'
import './Editor.css'
import { Contracts } from 'components/Playground/types'

export const OUTPUT_HEADLINE = '/***** Output *****/\n'

export default function Editor(props: Props) {
  const [code, setCode] = useState(defaultScript)
  const [copyText, setCopyText] = useState('Copy')
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prevContracts = usePrevious(props.contracts)

  let monacoRef = useRef<typeof monacoEditor | null>(null)
  let textareaRef: HTMLTextAreaElement
  let textTimeout: number = 0

  const instanceWindowVars = useCallback(() => {
    // @ts-ignore
    window['web3'] = getWeb3Instance()

    if (prevContracts) {
      Object.keys(prevContracts)
        .filter(key => prevContracts[key].instance)
        .forEach(key => {
          const contract = prevContracts[key]
          delete window[contract.name]
        })
    }

    if (props.contracts) {
      Object.keys(props.contracts)
        .filter(key => props.contracts[key].instance)
        .forEach(key => {
          const contract = props.contracts[key]
          window[contract.name] = contract.instance
        })
    }
  }, [props.contracts, prevContracts])

  function usePrevious(value: Contracts) {
    const ref = useRef<Contracts>()
    useEffect(() => {
      ref.current = value
    })
    return ref.current
  }

  // Did Mount
  useEffect(() => {
    const lastUsedCode = getLastUsedCode()
    if (lastUsedCode) {
      setCode(lastUsedCode)
    }
  }, [])

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.languages.typescript.typescriptDefaults.addExtraLib(
        typeContractMethods(editorTypes, props.contracts),
        'index.d.ts'
      )
      instanceWindowVars()
    }
  }, [props.contracts, instanceWindowVars])

  useEffect(() => () => {
    window.clearTimeout(textTimeout)
  })

  function editorWillMount(monaco: typeof monacoEditor) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      typeContractMethods(editorTypes, props.contracts),
      'index.d.ts'
    )

    monacoRef.current = monaco
    instanceWindowVars()
  }

  function editorDidMount(
    editor: monacoEditor.editor.IStandaloneCodeEditor,
    monaco: typeof monacoEditor
  ) {
    const model = editor.getModel()
    if (model && model.getModeId() === 'typescript') {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S, () => {
        // saveLastUsedCode(state.code)
        editor.trigger('format', 'editor.action.formatDocument', null)
      })
    }
  }

  function cleanState() {
    setIsRunning(true)
    setOutput(null)
    setError(null)
  }

  async function handleExecuteCode() {
    saveLastUsedCode(code)

    let output: string

    const setOutputState = (...values: any) => {
      if (output === undefined) {
        output = ''
      }

      if (values.length > 1) {
        values.forEach(
          (value: any) => (output += JSON.stringify(value, null, 2) + '\n')
        )
      } else {
        output += JSON.stringify(values[0], null, 2) + '\n'
      }

      setOutput(output)
    }

    try {
      cleanState()
      setOutputState(
        // eslint-disable-next-line
        await eval(`
       (function(){
          const console = {}

          console.log = function() {
            setOutputState(...arguments)
          }
          ${code}
          return main()
        })()
      `)
      )
    } catch (e) {
      setError(e.stack)
    }
    setIsRunning(false)
  }

  function handleCodeChange(newValue: string) {
    setCode(newValue)
  }

  function handleResetCode() {
    handleCodeChange(defaultScript)
  }

  function handleCopy() {
    setCopyText('Copied')

    if (isIOS()) {
      const range = document.createRange()
      range.selectNodeContents(textareaRef)
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
      textareaRef.setSelectionRange(0, 999999)
    } else {
      textareaRef.select()
    }

    document.execCommand('copy')

    textTimeout = window.setTimeout(() => setCopyText('Copy'), 1000)
  }

  function handleClearOutput() {
    setOutput(null)
    setError(null)
  }

  let outputValue = OUTPUT_HEADLINE

  if (isRunning) {
    outputValue = 'Running...'
  } else if (output) {
    outputValue = output
  }

  if (error) {
    outputValue += error
  }

  return (
    <>
      <div className={`Editor ${props.isMaximized ? ' maximized' : ''}`}>
        <div className="code-wrapper">
          <div className="actions">
            <div className="col left">
              <button onClick={props.onChangeSize} title="Hide">
                {props.isMaximized ? (
                  <i className="icon hide" />
                ) : (
                  <i className="icon maximize" />
                )}
                {props.isMaximized ? 'Minimize' : 'Maximize'}
              </button>
              <button onClick={handleExecuteCode} title="Run">
                <i className="icon run" />
                {'Run'}
              </button>
            </div>
            <div className="col right">
              <button onClick={handleResetCode} title="Reset">
                <i className="icon reset" />
                {'Reset'}
              </button>
            </div>
          </div>
          <MonacoEditor
            language="typescript"
            theme="vs-dark"
            value={code}
            onChange={handleCodeChange}
            editorWillMount={editorWillMount}
            editorDidMount={editorDidMount}
            options={{
              automaticLayout: true,
              lineNumbers: 'off',
              minimap: { enabled: false },
              fontSize: 11
            }}
          />
        </div>
        <div className="output-wrapper">
          <div className="actions">
            <div className="col left">
              <button onClick={handleCopy} title="Copy">
                <i className="icon copy" />
                {copyText}
              </button>
            </div>
            <div className="col right">
              <button onClick={handleClearOutput} title="Clear">
                <i className="icon reset" />
                {'Clear'}
              </button>
            </div>
          </div>
          <MonacoEditor
            language="typescript"
            theme="vs-dark"
            value={outputValue}
            options={{
              readOnly: true,
              automaticLayout: true,
              lineNumbers: 'off',
              minimap: { enabled: false },
              fontSize: 10,
              folding: false
            }}
          />
        </div>
      </div>
      <textarea
        readOnly={true}
        className="no-visible"
        ref={textarea => {
          if (textarea) {
            textareaRef = textarea
          }
        }}
        value={outputValue}
      />
    </>
  )
}
