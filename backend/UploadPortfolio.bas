Option Explicit

' ============================================================
' UploadPortfolio.bas
' Uploads the "Data" sheet from this workbook to the Django API
' as a multipart Excel file, then uploads the 3 historical tables.
'
' HOW TO USE:
'   1. Open the Excel workbook
'   2. Open VBA Editor (Alt+F11)
'   3. Insert > Module and paste this code
'   4. Run UploadToDashboard
' ============================================================

Sub UploadToDashboard()
    Dim http As Object
    Dim Stream As Object
    Dim FileStream As Object
    Dim Boundary As String
    Dim FilePath As String
    Dim TempPath As String
    Dim BackendURL As String

    Dim BodyStart As String
    Dim BodyEnd As String
    Dim StartBytes() As Byte
    Dim EndBytes() As Byte

    BackendURL = "https://equitydashboard-production-6f9d.up.railway.app/api/snapshots/upload_excel/"

    ' 1. FORCE LOCAL COPY (Bypasses SharePoint URL issues)
    TempPath = Environ("TEMP") & "\" & ThisWorkbook.Name

    On Error Resume Next
    If Dir(TempPath) <> "" Then Kill TempPath
    On Error GoTo 0

    ThisWorkbook.SaveCopyAs TempPath
    FilePath = TempPath

    If Len(Dir$(FilePath)) = 0 Then
        MsgBox "Failed to create local temp file for upload.", vbCritical
        Exit Sub
    End If

    ' 2. PREPARE MULTIPART DATA
    Boundary = "----ExcelBoundary" & Format(Now, "yyyymmddhhnnss")

    BodyStart = "--" & Boundary & vbCrLf & _
                "Content-Disposition: form-data; name=""file""; filename=""" & ThisWorkbook.Name & """" & vbCrLf & _
                "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" & vbCrLf & vbCrLf

    BodyEnd = vbCrLf & "--" & Boundary & "--" & vbCrLf

    StartBytes = StrConv(BodyStart, vbFromUnicode)
    EndBytes = StrConv(BodyEnd, vbFromUnicode)

    ' 3. ASSEMBLE THE BINARY STREAM
    Set Stream = CreateObject("ADODB.Stream")
    Stream.Type = 1 ' Binary
    Stream.Open

    Stream.Write StartBytes

    Set FileStream = CreateObject("ADODB.Stream")
    FileStream.Type = 1
    FileStream.Open
    FileStream.LoadFromFile FilePath
    Stream.Write FileStream.Read
    FileStream.Close

    Stream.Write EndBytes

    ' 4. SEND THE REQUEST
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "POST", BackendURL, False
    http.SetRequestHeader "Content-Type", "multipart/form-data; boundary=" & Boundary
    Stream.Position = 0
    http.Send Stream.Read

    ' 5. HANDLE RESPONSE
    If http.Status = 200 Or http.Status = 201 Then
        MsgBox "Portfolio upload successful!", vbInformation
    Else
        MsgBox "Portfolio upload failed" & vbCrLf & _
               "Status: " & http.Status & vbCrLf & _
               "Response: " & http.ResponseText, vbCritical
        GoTo Cleanup
    End If

Cleanup:
    Set Stream = Nothing
    Set http = Nothing
    If Dir(FilePath) <> "" Then Kill FilePath

    ' Upload the 3 historical tables
    Call UploadAllTables
End Sub
