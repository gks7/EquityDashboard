' ============================================================
' UploadTables.bas
' Uploads RefTableAuxHistCashTransaction, RefTableAuxHistIndexPrice
' and RefTableAuxAssetPositionHistOfficial to the Django API.
'
' HOW TO USE:
'   1. Open the Excel workbook
'   2. Open VBA Editor (Alt+F11)
'   3. Insert > Module and paste this code
'   4. Set API_BASE_URL below to your server address
'   5. Run UploadAllTables
' ============================================================

Option Explicit

Const API_BASE_URL As String = "https://satisfied-mercy-production.up.railway.app/api"
Const CHUNK_SIZE As Long = 500   ' rows per HTTP request

' ---- Main entry point ----------------------------------------
Sub UploadAllTables()
    Dim t As Double
    t = Timer

    MsgBox "Starting upload. This may take a while for large tables.", vbInformation

    UploadCashTransactions
    UploadIndexPrices
    UploadAssetPositions
    UploadNAVPositions

    MsgBox "All tables uploaded in " & Format(Timer - t, "0.0") & "s", vbInformation
End Sub

' ---- Cash Transactions ---------------------------------------
Sub UploadCashTransactions()
    Dim tbl As ListObject
    Set tbl = FindTable("RefTableAuxHistCashTransaction")
    If tbl Is Nothing Then
        MsgBox "Table RefTableAuxHistCashTransaction not found!", vbCritical
        Exit Sub
    End If

    Dim cols As Object
    Set cols = BuildColIndex(tbl)

    Dim rows As New Collection
    Dim r As ListRow
    For Each r In tbl.ListRows
        Dim obj As String
        obj = "{"
        obj = obj & """ID"":" & JsonVal(CellVal(r, cols, "ID")) & ","
        obj = obj & """Date"":" & JsonStr(CellVal(r, cols, "Date")) & ","
        obj = obj & """SettlementDate"":" & JsonStr(CellVal(r, cols, "SettlementDate")) & ","
        obj = obj & """Fund"":" & JsonStr(CellVal(r, cols, "Fund")) & ","
        obj = obj & """Cash Account"":" & JsonStr(CellVal(r, cols, "Cash Account")) & ","
        obj = obj & """Amount"":" & JsonVal(CellVal(r, cols, "Amount")) & ","
        obj = obj & """Type"":" & JsonStr(CellVal(r, cols, "Type")) & ","
        obj = obj & """Counterparty Account"":" & JsonStr(CellVal(r, cols, "Counterparty Account")) & ","
        obj = obj & """IsManual"":" & JsonVal(CellVal(r, cols, "IsManual")) & ","
        obj = obj & """Obs"":" & JsonStr(CellVal(r, cols, "Obs")) & ","
        obj = obj & """CMD"":" & JsonStr(CellVal(r, cols, "CMD"))
        obj = obj & "}"
        rows.Add obj
    Next r

    PostInChunks API_BASE_URL & "/hist/cash-transactions/upload/", rows, "Cash Transactions"
End Sub

' ---- Index Prices --------------------------------------------
Sub UploadIndexPrices()
    Dim tbl As ListObject
    Set tbl = FindTable("RefTableAuxHistIndexPrice")
    If tbl Is Nothing Then
        MsgBox "Table RefTableAuxHistIndexPrice not found!", vbCritical
        Exit Sub
    End If

    Dim cols As Object
    Set cols = BuildColIndex(tbl)

    Dim rows As New Collection
    Dim r As ListRow
    For Each r In tbl.ListRows
        Dim obj As String
        obj = "{"
        obj = obj & """pk_AssetInfoID"":" & JsonVal(CellVal(r, cols, "pk_AssetInfoID")) & ","
        obj = obj & """Date"":" & JsonStr(CellVal(r, cols, "Date")) & ","
        obj = obj & """Fund"":" & JsonStr(CellVal(r, cols, "Fund")) & ","
        obj = obj & """Asset"":" & JsonStr(CellVal(r, cols, "Asset")) & ","
        obj = obj & """Info"":" & JsonStr(CellVal(r, cols, "Info")) & ","
        obj = obj & """st_Value"":" & JsonStr(CellVal(r, cols, "st_Value")) & ","
        obj = obj & """flt_Value"":" & JsonVal(CellVal(r, cols, "flt_Value")) & ","
        obj = obj & """bln_Value"":" & JsonVal(CellVal(r, cols, "bln_Value")) & ","
        obj = obj & """dte_Value"":" & JsonStr(CellVal(r, cols, "dte_Value")) & ","
        obj = obj & """Column1"":" & JsonStr(CellVal(r, cols, "Column1")) & ","
        obj = obj & """Column2"":" & JsonStr(CellVal(r, cols, "Column2"))
        obj = obj & "}"
        rows.Add obj
    Next r

    PostInChunks API_BASE_URL & "/hist/index-prices/upload/", rows, "Index Prices"
End Sub

' ---- NAV Positions -------------------------------------------
Sub UploadNAVPositions()
    Dim rng As Range
    On Error GoTo NotFound
    Set rng = ThisWorkbook.Names("RefTableAuxNAVPosition").RefersToRange
    On Error GoTo 0

    ' Headers are one row above the data range
    Dim headers() As String
    Dim nCols As Integer
    nCols = rng.Columns.Count
    ReDim headers(1 To nCols)
    Dim i As Integer
    For i = 1 To nCols
        headers(i) = CStr(rng.Cells(0, i).Value)
    Next i

    Dim rows As New Collection
    Dim nRows As Long
    nRows = rng.Rows.Count
    Dim rowIdx As Long

    For rowIdx = 1 To nRows
        ' Skip if Fund and Date cells are both empty
        Dim fundVal As String
        fundVal = Trim(CStr(rng.Cells(rowIdx, 1).Value))
        If fundVal = "" Or fundVal = "0" Then GoTo NextNavRow

        Dim obj As String
        obj = "{"
        For i = 1 To nCols
            Dim cellVal As String
            cellVal = Trim(CStr(rng.Cells(rowIdx, i).Value))
            obj = obj & """" & EscapeJson(headers(i)) & """:" & JsonStr(cellVal)
            If i < nCols Then obj = obj & ","
        Next i
        obj = obj & "}"
        rows.Add obj
NextNavRow:
    Next rowIdx

    PostInChunks API_BASE_URL & "/hist/nav-positions/upload/", rows, "NAV Positions"
    Exit Sub

NotFound:
    MsgBox "Named range RefTableAuxNAVPosition not found!", vbCritical
End Sub

' ---- Asset Positions (Named Range) ---------------------------
Sub UploadAssetPositions()
    Dim rng As Range
    On Error GoTo NotFound
    Set rng = ThisWorkbook.Names("RefTableAuxAssetPositionHistOfficial").RefersToRange
    On Error GoTo 0

    ' Headers are one row above the data range
    Dim headers() As String
    Dim nCols As Integer
    nCols = rng.Columns.Count
    ReDim headers(1 To nCols)
    Dim i As Integer
    For i = 1 To nCols
        headers(i) = CStr(rng.Cells(0, i).Value)
    Next i

    Dim rows As New Collection
    Dim nRows As Long
    nRows = rng.Rows.Count
    Dim rowIdx As Long

    For rowIdx = 1 To nRows
        ' Skip if Date cell is empty
        Dim dateVal As String
        dateVal = Trim(CStr(rng.Cells(rowIdx, 1).Value))
        If dateVal = "" Or dateVal = "0" Then GoTo NextRow

        Dim obj As String
        obj = "{"
        For i = 1 To nCols
            Dim cellVal As String
            cellVal = Trim(CStr(rng.Cells(rowIdx, i).Value))
            obj = obj & """" & EscapeJson(headers(i)) & """:" & JsonStr(cellVal)
            If i < nCols Then obj = obj & ","
        Next i
        obj = obj & "}"
        rows.Add obj
NextRow:
    Next rowIdx

    PostInChunks API_BASE_URL & "/hist/asset-positions/upload/", rows, "Asset Positions"
    Exit Sub

NotFound:
    MsgBox "Named range RefTableAuxAssetPositionHistOfficial not found!", vbCritical
End Sub

' ---- Helpers -------------------------------------------------

Function FindTable(tblName As String) As ListObject
    Dim ws As Worksheet
    Dim tbl As ListObject
    For Each ws In ThisWorkbook.Worksheets
        For Each tbl In ws.ListObjects
            If tbl.Name = tblName Then
                Set FindTable = tbl
                Exit Function
            End If
        Next tbl
    Next ws
    Set FindTable = Nothing
End Function

Function BuildColIndex(tbl As ListObject) As Object
    Dim dict As Object
    Set dict = CreateObject("Scripting.Dictionary")
    Dim col As ListColumn
    For Each col In tbl.ListColumns
        dict(col.Name) = col.Index
    Next col
    Set BuildColIndex = dict
End Function

Function CellVal(r As ListRow, cols As Object, colName As String) As String
    If cols.Exists(colName) Then
        CellVal = Trim(CStr(r.Range.Cells(1, cols(colName)).Value))
    Else
        CellVal = ""
    End If
End Function

Function JsonStr(v As String) As String
    ' Returns a JSON string or null
    If v = "" Or v = "0" Or LCase(v) = "false" And False Then
        ' keep as string — let server decide
    End If
    If v = "" Then
        JsonStr = "null"
    Else
        JsonStr = """" & EscapeJson(v) & """"
    End If
End Function

Function JsonVal(v As String) As String
    ' Returns a number, boolean, or null (no quotes)
    If v = "" Then
        JsonVal = "null"
    ElseIf LCase(v) = "true" Then
        JsonVal = "true"
    ElseIf LCase(v) = "false" Then
        JsonVal = "false"
    ElseIf IsNumeric(v) Then
        JsonVal = v
    Else
        ' Fallback to string
        JsonVal = """" & EscapeJson(v) & """"
    End If
End Function

Function EscapeJson(s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, Chr(10), "\n")
    s = Replace(s, Chr(13), "\r")
    EscapeJson = s
End Function

Sub PostInChunks(url As String, rows As Collection, label As String)
    Dim total As Long
    total = rows.Count
    If total = 0 Then
        MsgBox label & ": no rows to upload.", vbInformation
        Exit Sub
    End If

    Dim sent As Long
    sent = 0
    Dim chunkNum As Long
    chunkNum = 0

    Do While sent < total
        chunkNum = chunkNum + 1
        Dim chunkEnd As Long
        chunkEnd = sent + CHUNK_SIZE
        If chunkEnd > total Then chunkEnd = total

        ' Build JSON array for this chunk
        Dim jsonBody As String
        jsonBody = "{""rows"":["
        Dim i As Long
        For i = sent + 1 To chunkEnd
            If i > sent + 1 Then jsonBody = jsonBody & ","
            jsonBody = jsonBody & rows(i)
        Next i
        jsonBody = jsonBody & "]}"

        ' Only first chunk replaces all; subsequent chunks will also replace
        ' (server always clears on first upload call — chunk 1 clears, rest append)
        Dim endpoint As String
        endpoint = url
        If chunkNum > 1 Then endpoint = url & "?append=1"

        Dim http As Object
        Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
        http.Open "POST", endpoint, False
        http.SetRequestHeader "Content-Type", "application/json"
        http.Send jsonBody

        If http.Status <> 201 Then
            MsgBox label & " chunk " & chunkNum & " failed." & vbNewLine & _
                   "Status: " & http.Status & vbNewLine & http.ResponseText, vbCritical
            Exit Sub
        End If

        sent = chunkEnd
        Application.StatusBar = label & ": " & sent & "/" & total & " rows sent..."
    Loop

    Application.StatusBar = False
    MsgBox label & ": " & total & " rows uploaded successfully.", vbInformation
End Sub
