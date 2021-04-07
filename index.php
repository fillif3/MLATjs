<?php
function getRequestDataBody()
{
    $body = file_get_contents('php://input');

    if (empty($body)) {
        return [];
    }

    // Parse json body and notify when error occurs
    $data = json_decode($body, true);
    if (json_last_error()) {
        trigger_error(json_last_error_msg());
        return [];
    }
    return $data['password'];
}
$flag='false';
$publicPasswordList = ['ccccccvbigrr'];
$datesList = [strtotime("32-03-26")];
$now = strtotime(date("Y/m/d"));
$postedPass = getRequestDataBody();
$i=0;
foreach ($publicPasswordList as $pass) {
  if (substr($postedPass,0,12)===$pass) {
    if ($now<$datesList[$i]) $flag= 'true';
    break 1;
    }
  $i++;
}
echo $flag;
?>
