Option Explicit

' ============================================================
' UploadAlpha.bas
' Uploads the "Data" sheet from this workbook to the Alpha
' (P/E-band forward-return) endpoint on the Equity Dashboard.
'
' Expected sheet layout (in a sheet named "Data"):
'   Row 1 (optional blank), Row 2 headers: Stock | Date | Price | P/E | Forward Return
'   Row 3+ : daily observations
'
' HOW TO USE:
'   1. Open the Excel workbook (e.g. Bloomberg_upload.xlsm)
'   2. Open VBA Editor (Alt+F11)
'   3. Insert > Module and paste this code
'   4. Set ALPHA_USERNAME / ALPHA_PASSWORD constants below (or
'      leave blank to be prompted on each run)
'   5. Run UploadAlphaToDashboard
' ============================================================

Private Const BACKEND_URL As String = "https://equitydashboard-production-6f9d.up.railway.app"
Private Const ALPHA_USERNAME As String = ""    ' optional: hardcode your username
Private Const ALPHA_PASSWORD As String = ""    ' optional: hardcode your password

Sub UploadAlphaToDashboard()
    Dim http As Object
    Dim Stream As Object
    Dim FileStream As Object
    Dim Boundary As String
    Dim FilePath As String
    Dim TempPath As String
    Dim AccessToken As String
    Dim UploadURL As String

    UploadURL = BACKEND_URL & "/api/alpha/upload_excel/"

    ' 1. AUTHENTICATE -> get JWT access token
    AccessToken = GetAlphaAccessToken()
    If Len(AccessToken) = 0 Then
        MsgBox "Authentication failed. Cannot upload.", vbCritical
        Exit Sub
    End If

    ' 2. FORCE LOCAL COPY (bypass SharePoint path issues)
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

    ' 3. BUILD MULTIPART BODY
    Boundary = "----AlphaBoundary" & Format(Now, "yyyymmddhhnnss")

    Dim BodyStart As String, BodyEnd As String
    BodyStart = "--" & Boundary & vbCrLf & _
                "Content-Disposition: form-data; name=""file""; filename=""" & ThisWorkbook.Name & """" & vbCrLf & _
                "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" & vbCrLf & vbCrLf
    BodyEnd = vbCrLf & "--" & Boundary & "--" & vbCrLf

    Dim StartBytes() As Byte, EndBytes() As Byte
    StartBytes = StrConv(BodyStart, vbFromUnicode)
    EndBytes = StrConv(BodyEnd, vbFromUnicode)

    Set Stream = CreateObject("ADODB.Stream")
    Stream.Type = 1   ' Binary
    Stream.Open
    Stream.Write StartBytes

    Set FileStream = CreateObject("ADODB.Stream")
    FileStream.Type = 1
    FileStream.Open
    FileStream.LoadFromFile FilePath
    Stream.Write FileStream.Read
    FileStream.Close

    Stream.Write EndBytes

    ' 4. POST
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "POST", UploadURL, False
    http.SetRequestHeader "Authorization", "Bearer " & AccessToken
    http.SetRequestHeader "Content-Type", "multipart/form-data; boundary=" & Boundary
    Stream.Position = 0
    http.Send Stream.Read

    ' 5. HANDLE RESPONSE
    If http.Status = 200 Or http.Status = 201 Then
        MsgBox "Alpha upload successful!" & vbCrLf & vbCrLf & http.ResponseText, vbInformation
    Else
        MsgBox "Alpha upload failed" & vbCrLf & _
               "Status: " & http.Status & vbCrLf & _
               "Response: " & http.ResponseText, vbCritical
    End If

    ' 6. CLEANUP
    Set Stream = Nothing
    Set http = Nothing
    If Dir(FilePath) <> "" Then Kill FilePath
End Sub

Private Function GetAlphaAccessToken() As String
    Dim http As Object
    Dim u As String, p As String
    Dim payload As String

    u = ALPHA_USERNAME
    p = ALPHA_PASSWORD
    If Len(u) = 0 Then u = InputBox("Dashboard username:", "Login")
    If Len(u) = 0 Then GetAlphaAccessToken = "": Exit Function
    If Len(p) = 0 Then p = InputBox("Dashboard password:", "Login")
    If Len(p) = 0 Then GetAlphaAccessToken = "": Exit Function

    payload = "{""username"":""" & JsonEscape(u) & """,""password"":""" & JsonEscape(p) & """}"

    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "POST", BACKEND_URL & "/api/token/", False
    http.SetRequestHeader "Content-Type", "application/json"
    http.Send payload

    If http.Status <> 200 Then
        MsgBox "Login failed (" & http.Status & "): " & http.ResponseText, vbCritical
        GetAlphaAccessToken = ""
        Exit Function
    End If

    GetAlphaAccessToken = ExtractJsonString(http.ResponseText, "access")
End Function

Private Function ExtractJsonString(ByVal json As String, ByVal key As String) As String
    Dim needle As String, i As Long, j As Long
    needle = """" & key & """"
    i = InStr(1, json, needle, vbBinaryCompare)
    If i = 0 Then ExtractJsonString = "": Exit Function
    i = InStr(i + Len(needle), json, """")
    If i = 0 Then ExtractJsonString = "": Exit Function
    j = InStr(i + 1, json, """")
    If j = 0 Then ExtractJsonString = "": Exit Function
    ExtractJsonString = Mid$(json, i + 1, j - i - 1)
End Function

Private Function JsonEscape(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    JsonEscape = s
End Function
